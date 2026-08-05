import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  and,
  authEvents,
  auditLog,
  eq,
  gyms,
  isNull,
  memberships,
  ne,
  organizations,
  sessions,
  users,
  withTenant,
  withoutTenant,
  type Database,
  type MembershipRole,
} from '@gymlab/db';
import type {
  EmailFlowResponse,
  ForgotPasswordInput,
  GymStaffMember,
  LoginInput,
  Me,
  RegisterGymInput,
  ResetPasswordInput,
  SessionResponse,
  VerifyEmailInput,
} from '@gymlab/contracts';
import { ipDe } from '../common/http';
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';
import { GYM_CREATED_HOOK, type GymCreatedHooks } from '../common/gym-hooks';
import type { Auth } from './auth.instance';
import { AUTH } from './auth.tokens';
import { AuthThrottle } from './auth.throttle';

/**
 * Resultado de los flujos que abren o cierran sesion.
 *
 * Ademas del cuerpo, devuelve las cabeceras de Better Auth para que el
 * controlador traslade sus cookies a la respuesta. El token sigue en el cuerpo
 * para la app movil, que no tiene cookies.
 */
export interface AuthResult {
  session: SessionResponse;
  authHeaders: Headers;
}

/** Personal: la sesion muere dentro de la misma jornada (ADR-0007, decision 8). */
const SESION_PERSONAL_MS = 12 * 60 * 60 * 1000;
/** Socio: su movil personal; espera no volver a entrar en meses. */
const SESION_SOCIO_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
    private readonly throttle: AuthThrottle,
    /**
     * Quienes reaccionan al alta de un gimnasio.
     *
     * `auth` NO conoce ningun modulo de dominio: conoce una interfaz de
     * `common`. Antes inyectaba `TrainingService` directamente, y eso hacia que
     * el modulo mas global del sistema dependiera de uno de dominio y dejaba un
     * ciclo latente. Ver `common/gym-hooks.ts`.
     */
    @Optional()
    @Inject(GYM_CREATED_HOOK)
    private readonly gymHooks: GymCreatedHooks = [],
  ) {}

  /**
   * Alta de un gimnasio. Unico registro publico (ADR-0007, decision 5).
   *
   * El orden importa y no es casual:
   *
   *  1. Se genera el id del gimnasio ANTES de tocar la base de datos, para
   *     poder abrir la transaccion ya con `app.gym_id` fijado a el. Asi la
   *     politica de INSERT de `gyms` (`id = app_current_gym_id()`) se cumple, y
   *     la de `memberships` tambien. Sin esto habria que crear el gimnasio sin
   *     contexto y abrir una segunda transaccion para la membresia — y un fallo
   *     entre ambas dejaria un gimnasio huerfano sin dueno.
   *
   *  2. El usuario se crea con Better Auth ANTES de la transaccion, porque su
   *     adaptador usa su propia conexion y no participa de la nuestra.
   *     LIMITACION ASUMIDA: si la transaccion siguiente falla, queda un usuario
   *     sin gimnasio. Es recuperable —puede volver a intentarlo— y no expone
   *     datos de nadie.
   */
  async registerGym(input: RegisterGymInput, headers: Headers): Promise<AuthResult> {
    if (input.platformCode !== env.PLATFORM_INVITE_CODE) {
      throw new ForbiddenException('Codigo de plataforma no valido.');
    }

    const signUp = await this.auth.api.signUpEmail({
      body: { name: input.ownerName, email: input.email, password: input.password },
      headers,
      returnHeaders: true,
    });

    const userId = signUp.response.user.id;
    const gymId = randomUUID();
    const organizationId = randomUUID();

    await withTenant(
      this.db,
      gymId,
      async (tx) => {
        await tx.insert(organizations).values({ id: organizationId, name: input.organizationName });
        await tx
          .insert(gyms)
          .values({ id: gymId, organizationId, name: input.gymName, slug: gymId });
        await tx.insert(memberships).values({ gymId, userId, role: 'owner' });

        // Quien tenga algo que hacer al crearse un gimnasio, lo hace aqui: hoy,
        // sembrar su biblioteca de ejercicios (ADR-0012).
        //
        // DENTRO DE LA MISMA TRANSACCION: un gimnasio a medio crear, con
        // pertenencia pero sin ejercicios, dejaria el modulo de rutinas
        // inservible desde el primer dia y sin ningun error que lo delatase.
        //
        // En serie, no en paralelo: todos escriben en esta misma transaccion.
        for (const hook of this.gymHooks) {
          await hook.onGymCreated({ gymId, ownerUserId: userId, tx });
        }
      },
      { userId },
    );

    // El gimnasio recien creado pasa a ser el activo de esta sesion.
    await this.applySessionPolicy({ token: signUp.response.token ?? '' }, gymId, 'owner');
    await this.recordAuthEvent('login_success', userId, input.email, headers);

    return {
      session: { token: signUp.response.token ?? '', activeGymId: gymId },
      authHeaders: signUp.headers,
    };
  }

  /**
   * Inicio de sesion.
   *
   * Si la persona pertenece a un solo gimnasio, se fija como activo. Con cero o
   * varios queda en null y el cliente elige con /switch-gym: adivinar cual
   * quiere seria peor que preguntar.
   */
  async login(input: LoginInput, headers: Headers): Promise<AuthResult> {
    // El intento se registra ANTES de verificar la contrasena, en una sentencia
    // atomica. Contar despues dejaria una ventana de ~100 ms —lo que tarda
    // scrypt— por la que pasarian todas las peticiones simultaneas.
    const ip = ipDe(headers);
    if (await this.throttle.registrarIntentoYComprobar(input.email, ip)) {
      throw new HttpException(
        'Demasiados intentos fallidos. Prueba de nuevo en unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let resultado;
    try {
      resultado = await this.auth.api.signInEmail({
        body: { email: input.email, password: input.password },
        headers,
        returnHeaders: true,
      });
    } catch {
      await this.recordAuthEvent('login_failure', null, input.email, headers);
      // Mismo mensaje para email inexistente y contrasena incorrecta: decir
      // cual de las dos falla permite enumerar usuarios registrados.
      throw new UnauthorizedException('Credenciales no validas.');
    }

    const userId = resultado.response.user.id;
    const token = resultado.response.token ?? '';
    const propias = await this.listMemberships(userId);
    const activeGymId = propias.length === 1 ? propias[0]!.gymId : null;

    if (activeGymId) await this.applySessionPolicy({ token }, activeGymId, propias[0]!.role);
    // Acertar la contrasena limpia el contador: a nadie se le penaliza por
    // haberse equivocado antes de entrar bien.
    await this.throttle.limpiar(input.email, ip);
    await this.recordAuthEvent('login_success', userId, input.email, headers);

    return { session: { token, activeGymId }, authHeaders: resultado.headers };
  }

  async logout(headers: Headers, userId: string): Promise<{ ok: true; authHeaders: Headers }> {
    // `returnHeaders` para poder trasladar la cookie de borrado: sin ella, el
    // navegador conservaria una cookie que ya no vale para nada.
    const salida = await this.auth.api.signOut({ headers, returnHeaders: true });
    await this.recordAuthEvent('logout', userId, null, headers);
    return { ok: true, authHeaders: salida.headers };
  }

  async me(userId: string, activeGymId: string | null): Promise<Me> {
    const [usuario] = await withoutTenant(this.db, (tx) =>
      tx.select().from(users).where(eq(users.id, userId)).limit(1),
    );
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    return {
      user: {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        emailVerified: usuario.emailVerified,
        isPlatformAdmin: usuario.isPlatformAdmin,
      },
      activeGymId,
      memberships: await this.listMemberships(userId),
    };
  }

  /**
   * Cambia el gimnasio activo de la sesion.
   *
   * La pertenencia se comprueba **siempre**, aunque el cliente solo pueda haber
   * obtenido la lista de /me: el gym_id que llega es entrada del usuario, y es
   * el valor que despues alimenta `withTenant()`. Es exactamente el punto donde
   * un fallo se convertiria en acceso a otro gimnasio.
   */
  async switchGym(userId: string, sessionId: string, gymId: string): Promise<SessionResponse> {
    const propias = await this.listMemberships(userId);
    const destino = propias.find((m) => m.gymId === gymId);
    if (!destino) {
      throw new ForbiddenException('No perteneces a ese gimnasio.');
    }

    // Se identifica la sesion por su id, que AuthGuard ya resolvio a partir de
    // la peticion. Antes se leia el token de la cabecera o de una cookie, lo
    // que obligaba a conocer el nombre de la cookie de Better Auth — un detalle
    // interno suyo que no debemos replicar.
    //
    // El rol se recalcula: cambiar a un gimnasio donde eres socio debe acortar
    // o alargar la sesion segun corresponda.
    await this.applySessionPolicy({ id: sessionId }, gymId, destino.role);
    return { token: '', activeGymId: gymId };
  }

  /**
   * Quien forma parte del gimnasio ahora mismo.
   *
   * NO es un listado de pertenencias: es el personal. Los socios quedan fuera
   * porque `member` es una forma de pertenecer al gimnasio, no de trabajar en
   * el, y mezclarlos convertiria esta lista en la de socios con otro nombre.
   *
   * Lo ven dueno y recepcion: saber quien trabaja aqui es operativa diaria y
   * evita reinvitar a alguien que ya esta. Retirar el acceso, en cambio, es
   * solo del dueno — ver la lista no da poder sobre ella.
   *
   * Ordenado por rol y despues por nombre. El orden del enum es el de la
   * jerarquia (dueno, recepcion, entrenador), asi que sale solo.
   */
  async listStaff(gymId: string): Promise<GymStaffMember[]> {
    const filas = await withTenant(this.db, gymId, (tx) =>
      tx
        .select({
          userId: memberships.userId,
          name: users.name,
          email: users.email,
          role: memberships.role,
          joinedAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.gymId, gymId),
            isNull(memberships.endedAt),
            ne(memberships.role, 'member'),
          ),
        )
        .orderBy(memberships.role, users.name),
    );

    return filas.map((f) => ({
      userId: f.userId,
      name: f.name,
      email: f.email,
      role: f.role,
      joinedAt: f.joinedAt.toISOString(),
    }));
  }

  /**
   * Retira el acceso de una persona a este gimnasio.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ NO BORRA: TERMINA. La fila se queda con su rol y sus fechas, porque  │
   * │ «quien fue recepcion entre marzo y julio» hace falta despues.        │
   * │                                                                      │
   * │ Surte efecto en la SIGUIENTE peticion de esa persona: `AuthGuard`    │
   * │ consulta la pertenencia vigente en cada una, y al no encontrarla     │
   * │ responde 401. No hay que invalidar sesiones ni esperar a que caduquen.│
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * DOS REGLAS, y las dos son de producto:
   *
   * 1. **Nadie puede retirarse a si mismo.** Es una linea, y con ella un
   *    gimnasio no puede quedarse sin propietarios: el ultimo que quede no
   *    puede irse. No hace falta contar propietarios ni casos especiales.
   * 2. **Solo el dueno retira.** Recepcion puede deshacer sus errores
   *    revocando invitaciones pendientes; cortarle el acceso a alguien ya
   *    incorporado es decision de direccion. El rol lo comprueba `RolesGuard`.
   *
   * LO QUE NO HACE, y es deliberado: si esa persona era entrenador, sus socios
   * asignados se quedan sin entrenador efectivo. Se prefiere eso a que un
   * gimnasio no pueda cortarle el acceso a un exempleado por no haber
   * reasignado antes a dos socios.
   */
  async revokeAccess(gymId: string, actorUserId: string, userId: string): Promise<{ ok: true }> {
    if (actorUserId === userId) {
      throw new BadRequestException(
        'No puedes retirarte el acceso a ti mismo. Si te vas, nombra antes a otro propietario.',
      );
    }

    const terminadas = await withTenant(
      this.db,
      gymId,
      async (tx) => {
        const filas = await tx
          .update(memberships)
          .set({ endedAt: new Date(), endedByUserId: actorUserId, updatedAt: new Date() })
          .where(
            and(
              eq(memberships.gymId, gymId),
              eq(memberships.userId, userId),
              // Condicionado: retirar dos veces no vuelve a escribir la fecha,
              // y la segunda vez da 404 en lugar de un exito silencioso.
              isNull(memberships.endedAt),
            ),
          )
          .returning({ role: memberships.role });

        if (filas[0]) {
          await tx.insert(auditLog).values({
            gymId,
            actorUserId,
            action: 'membership.revoked',
            entityType: 'membership',
            entityId: userId,
            metadata: { role: filas[0].role },
          });
        }
        return filas;
      },
      { userId: actorUserId },
    );

    if (!terminadas[0]) {
      throw new NotFoundException('Esa persona no tiene acceso vigente a este gimnasio.');
    }
    return { ok: true };
  }

  /**
   * Solicita restablecer la contrasena.
   *
   * Responde `ok` siempre, exista el email o no. Distinguirlo permitiria
   * comprobar quien esta dado de alta en la plataforma.
   */
  async forgotPassword(input: ForgotPasswordInput, headers: Headers): Promise<EmailFlowResponse> {
    try {
      // El callback `sendResetPassword` encola el correo. Si el email no
      // existe, Better Auth no lo invoca y no se encola nada.
      await this.auth.api.requestPasswordReset({
        // Al PANEL WEB, no a la API: es donde hay un formulario para escribir la
        // contrasena nueva. Antes apuntaba a la API y llevaba a una URL sin
        // interfaz; no se noto porque los correos nunca se enviaban.
        body: { email: input.email, redirectTo: `${env.WEB_APP_URL}/reset-password` },
        headers,
      });
    } catch {
      // Silencio deliberado: ver el comentario de arriba.
    }

    await this.recordAuthEvent('password_reset_requested', null, input.email, headers);
    return { ok: true };
  }

  async resetPassword(input: ResetPasswordInput, headers: Headers): Promise<{ ok: true }> {
    try {
      await this.auth.api.resetPassword({
        body: { newPassword: input.newPassword, token: input.token },
        headers,
      });
    } catch {
      // Better Auth ya cubre un solo uso, caducidad y no reutilizacion.
      throw new BadRequestException('El enlace no es valido, ya se uso o ha caducado.');
    }
    await this.recordAuthEvent('password_reset_completed', null, null, headers);
    return { ok: true };
  }

  async verifyEmail(input: VerifyEmailInput, headers: Headers): Promise<{ ok: true }> {
    try {
      await this.auth.api.verifyEmail({ query: { token: input.token }, headers });
    } catch {
      throw new BadRequestException('El enlace no es valido, ya se uso o ha caducado.');
    }
    await this.recordAuthEvent('email_verified', null, null, headers);
    return { ok: true };
  }

  // --- Interno ----------------------------------------------------------

  /**
   * Membresias de una persona en todos sus gimnasios.
   *
   * Atraviesa tenants por definicion, asi que se apoya en la politica de
   * lectura de `memberships` que permite ver las filas propias
   * (`user_id = app_current_user_id()`). No hay contexto de gimnasio: aun asi
   * nadie puede ver las membresias de otra persona.
   */
  private async listMemberships(userId: string) {
    const filas = await withoutTenant(
      this.db,
      (tx) =>
        tx
          .select({ gymId: memberships.gymId, role: memberships.role, gymName: gyms.name })
          .from(memberships)
          .innerJoin(gyms, eq(gyms.id, memberships.gymId))
          /**
           * Solo las vigentes.
           *
           * REDUNDANTE A PROPOSITO: la politica RLS de `gyms` ya filtra por
           * `ended_at IS NULL`, asi que el `innerJoin` de arriba descarta la
           * fila aunque este `where` no estuviera — se comprobo quitandolo y
           * los tests seguian en verde. Se deja porque decir la intencion en el
           * codigo vale mas que depender del efecto lateral de un JOIN: el dia
           * que alguien cambie ese join por un `leftJoin`, esto sigue siendo
           * correcto.
           */
          .where(and(eq(memberships.userId, userId), isNull(memberships.endedAt))),
      { userId },
    );
    return filas.map((f) => ({ gymId: f.gymId, role: f.role, gymName: f.gymName ?? '' }));
  }

  /**
   * Fija el gimnasio activo y la caducidad de la sesion segun el rol.
   *
   * ADR-0007, decision 8: el personal trabaja en un ordenador compartido de
   * mostrador y su sesion debe morir al acabar el turno; el socio usa su movil
   * personal y espera no tener que volver a entrar.
   *
   * La caducidad es ABSOLUTA desde el login, no por inactividad. El ADR hablaba
   * de 8 h de inactividad y 12 h de maximo para el personal; Better Auth modela
   * el refresco de forma global, no por rol, asi que implementar ambas cosas
   * exigiria llevar la cuenta de la actividad a mano. Se implementa el maximo,
   * que es el que de verdad acota el riesgo: la sesion de recepcion caduca
   * dentro de la misma jornada pase lo que pase.
   *
   * `sessions` no tiene RLS: es anterior al contexto de tenant.
   */
  private async applySessionPolicy(
    selector: { token?: string; id?: string },
    gymId: string,
    role: MembershipRole,
  ): Promise<void> {
    const condicion = selector.token
      ? eq(sessions.token, selector.token)
      : selector.id
        ? eq(sessions.id, selector.id)
        : null;
    if (!condicion) return;

    const duracionMs = role === 'member' ? SESION_SOCIO_MS : SESION_PERSONAL_MS;

    await withoutTenant(this.db, (tx) =>
      tx
        .update(sessions)
        .set({ activeGymId: gymId, expiresAt: new Date(Date.now() + duracionMs) })
        .where(condicion),
    );
  }

  /**
   * Registro de autenticacion. Global y sin RLS: un intento fallido no tiene
   * gimnasio, porque todavia no se sabe quien lo intenta (ADR-0007).
   */
  private async recordAuthEvent(
    eventType:
      | 'login_success'
      | 'login_failure'
      | 'logout'
      | 'password_reset_requested'
      | 'password_reset_completed'
      | 'email_verified',
    userId: string | null,
    email: string | null,
    headers: Headers,
  ): Promise<void> {
    await withoutTenant(this.db, (tx) =>
      tx.insert(authEvents).values({
        userId,
        emailAttempted: email,
        eventType,
        ipAddress: ipDe(headers),
        userAgent: headers.get('user-agent') ?? null,
      }),
    );
  }
}
