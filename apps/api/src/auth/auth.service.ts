import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  and,
  authEvents,
  eq,
  gyms,
  memberships,
  organizations,
  sessions,
  users,
  withTenant,
  withoutTenant,
  type Database,
} from '@gymlab/db';
import type {
  EmailFlowResponse,
  ForgotPasswordInput,
  LoginInput,
  Me,
  RegisterGymInput,
  ResetPasswordInput,
  SessionResponse,
  VerifyEmailInput,
} from '@gymlab/contracts';
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';
import type { Auth } from './auth.instance';
import { AUTH } from './auth.tokens';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
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
  async registerGym(input: RegisterGymInput, headers: Headers): Promise<SessionResponse> {
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
        await tx.insert(gyms).values({ id: gymId, organizationId, name: input.gymName, slug: gymId });
        await tx.insert(memberships).values({ gymId, userId, role: 'owner' });
      },
      { userId },
    );

    // El gimnasio recien creado pasa a ser el activo de esta sesion.
    await this.setActiveGym(signUp.response.token ?? '', gymId);
    await this.recordAuthEvent('login_success', userId, input.email, headers);

    return { token: signUp.response.token ?? '', activeGymId: gymId };
  }

  /**
   * Inicio de sesion.
   *
   * Si la persona pertenece a un solo gimnasio, se fija como activo. Con cero o
   * varios queda en null y el cliente elige con /switch-gym: adivinar cual
   * quiere seria peor que preguntar.
   */
  async login(input: LoginInput, headers: Headers): Promise<SessionResponse> {
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

    if (activeGymId) await this.setActiveGym(token, activeGymId);
    await this.recordAuthEvent('login_success', userId, input.email, headers);

    return { token, activeGymId };
  }

  async logout(headers: Headers, userId: string): Promise<{ ok: true }> {
    await this.auth.api.signOut({ headers });
    await this.recordAuthEvent('logout', userId, null, headers);
    return { ok: true };
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
  async switchGym(userId: string, sessionToken: string, gymId: string): Promise<SessionResponse> {
    const propias = await this.listMemberships(userId);
    if (!propias.some((m) => m.gymId === gymId)) {
      throw new ForbiddenException('No perteneces a ese gimnasio.');
    }

    await this.setActiveGym(sessionToken, gymId);
    return { token: sessionToken, activeGymId: gymId };
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
        body: { email: input.email, redirectTo: `${env.API_URL}/reset-password` },
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
          .where(eq(memberships.userId, userId)),
      { userId },
    );
    return filas.map((f) => ({ gymId: f.gymId, role: f.role, gymName: f.gymName ?? '' }));
  }

  /** `sessions` no tiene RLS: es anterior al contexto de tenant. */
  private async setActiveGym(sessionToken: string, gymId: string): Promise<void> {
    if (!sessionToken) return;
    await withoutTenant(this.db, (tx) =>
      tx.update(sessions).set({ activeGymId: gymId }).where(eq(sessions.token, sessionToken)),
    );
  }

  /**
   * Registro de autenticacion. Global y sin RLS: un intento fallido no tiene
   * gimnasio, porque todavia no se sabe quien lo intenta (ADR-0007).
   */
  private async recordAuthEvent(
    eventType: 'login_success' | 'login_failure' | 'logout' | 'password_reset_requested' | 'password_reset_completed' | 'email_verified',
    userId: string | null,
    email: string | null,
    headers: Headers,
  ): Promise<void> {
    await withoutTenant(this.db, (tx) =>
      tx.insert(authEvents).values({
        userId,
        emailAttempted: email,
        eventType,
        ipAddress: headers.get('x-forwarded-for') ?? null,
        userAgent: headers.get('user-agent') ?? null,
      }),
    );
  }

  /** Comprueba que existe una pertenencia concreta. Lo usa el guard de gimnasio. */
  async assertMembership(userId: string, gymId: string): Promise<void> {
    const filas = await withTenant(
      this.db,
      gymId,
      (tx) =>
        tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.gymId, gymId), eq(memberships.userId, userId)))
          .limit(1),
      { userId },
    );
    if (!filas[0]) throw new ForbiddenException('No perteneces a ese gimnasio.');
  }
}
