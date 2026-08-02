import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  and,
  auditLog,
  EMAIL_QUEUES,
  eq,
  invitations,
  isNull,
  memberships,
  sessions,
  sql,
  users,
  withTenant,
  withoutTenant,
  type Database,
} from '@gymlab/db';
import type { AcceptInvitationInput, Invitation, Role } from '@gymlab/contracts';
import { ACCOUNT_EXISTS, canInvite } from '@gymlab/contracts';
import {
  INVITATION_ACCEPTED_HOOK,
  type InvitationAcceptedEvent,
  type InvitationAcceptedHooks,
} from '../common/invitation-hooks';
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';
import type { Auth } from '../auth/auth.instance';
import { AUTH } from '../auth/auth.tokens';
import { requireTransaction } from '../common/request-context';
import { JobsService } from '../jobs/jobs.service';

/** Duracion de una invitacion. Una semana es tiempo de sobra y limita la ventana. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly jobs: JobsService,
    /**
     * Punto de extension, OPCIONAL a proposito y en plural.
     *
     * `invitations` no depende de `members` ni de `trainers`: depende de una
     * interfaz que vive en `common`. Quienes la implementan se registran desde
     * fuera, en la raiz. Asi las unicas direcciones reales salen hacia aqui, sin
     * ciclo (ADR-0006).
     */
    @Optional()
    @Inject(INVITATION_ACCEPTED_HOOK)
    private readonly hooks: InvitationAcceptedHooks = [],
  ) {}

  /**
   * Avisa a quienes reaccionan a una invitacion aceptada.
   *
   * EN SERIE Y NO EN PARALELO: todos escriben en la MISMA transaccion, que la
   * lleva el evento. Un `Promise.all` lanzaria varias sentencias a la vez sobre
   * una sola conexion, que es justo lo que `node-postgres` no admite.
   *
   * Sin capturar errores: si uno falla, la transaccion entera se deshace y la
   * invitacion no se consume. Es la atomicidad que promete ADR-0010.
   */
  private async avisarHooks(evento: InvitationAcceptedEvent): Promise<void> {
    for (const hook of this.hooks) {
      await hook.onInvitationAccepted(evento);
    }
  }

  /**
   * Crea una invitacion.
   *
   * EL TOKEN LLEVA EL gym_id DELANTE, y no es un capricho:
   *
   *   token = "<gymId>.<secreto>"
   *
   * `invitations` tiene RLS, asi que para leer una invitacion hace falta saber
   * de que gimnasio es... pero quien acepta todavia no lo sabe. El token lo
   * lleva. El gym_id no es secreto; el secreto es la segunda mitad, y de ella
   * solo se guarda el hash.
   *
   * La alternativa habria sido abrir una politica de lectura por token sin
   * contexto de tenant, que es exactamente el tipo de excepcion que acaba
   * comiendose el aislamiento.
   */
  async create(
    gymId: string,
    actorUserId: string,
    actorRole: Role,
    email: string,
    role: Role,
    /**
     * Ficha de socio de la que sale la invitacion, si viene de una.
     *
     * Al aceptarse, es lo que permite rellenar `members.user_id`. El personal
     * —dueno, recepcion, entrenador— se invita sin ficha, y aqui va null.
     */
    memberId: string | null = null,
  ): Promise<Invitation> {
    if (!canInvite(actorRole, role)) {
      throw new ForbiddenException(`Un ${actorRole} no puede invitar a un ${role}.`);
    }

    const tx = requireTransaction();

    const yaEsMiembro = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.gymId, gymId), eq(users.email, email)))
      .limit(1);
    if (yaEsMiembro[0]) {
      throw new BadRequestException('Esa persona ya pertenece al gimnasio.');
    }

    const secreto = randomBytes(32).toString('base64url');
    const token = `${gymId}.${secreto}`;

    const [fila] = await tx
      .insert(invitations)
      .values({
        gymId,
        email,
        role,
        tokenHash: hashToken(token),
        memberId,
        invitedByUserId: actorUserId,
        expiresAt: new Date(Date.now() + TTL_MS),
      })
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: fila!.id,
      metadata: { email, role },
    });

    // Va dentro de la MISMA transaccion que la invitacion y su auditoria: si
    // algo falla despues, no queda un correo prometiendo una invitacion que no
    // existe. Es el caso que justifica ADR-0008.
    await this.jobs.enqueue(EMAIL_QUEUES.invitation, {
      to: email,
      token,
      // Al PANEL WEB, no a la API: quien acepta necesita un formulario donde
      // elegir su contrasena.
      url: `${env.WEB_APP_URL}/accept-invitation?token=${encodeURIComponent(token)}`,
    });

    return this.toDto(fila!);
  }

  async list(gymId: string): Promise<Invitation[]> {
    const tx = requireTransaction();
    const filas = await tx.select().from(invitations).where(eq(invitations.gymId, gymId));
    return filas.map((f) => this.toDto(f));
  }

  /**
   * Revoca una invitacion pendiente.
   *
   * Revocar una ya aceptada no tendria sentido —la persona ya esta dentro— y
   * revocar una ya revocada tampoco: ambas dan 404 en lugar de exito silencioso.
   */
  async revoke(gymId: string, actorUserId: string, invitationId: string): Promise<void> {
    const tx = requireTransaction();

    const filas = await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.gymId, gymId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });

    if (!filas[0]) {
      throw new NotFoundException('No hay ninguna invitacion pendiente con ese id.');
    }

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'invitation.revoked',
      entityType: 'invitation',
      entityId: invitationId,
    });
  }

  /**
   * Acepta una invitacion creando una cuenta NUEVA (ADR-0010).
   *
   * Publico, porque quien acepta todavia no tiene sesion.
   *
   * SI EL EMAIL YA TIENE CUENTA, responde 409 y no toca nada. Fijar aqui una
   * contrasena sobre una cuenta preexistente seria un secuestro: el email de la
   * invitacion lo elige el personal del gimnasio, asi que podria invitar a una
   * direccion con cuenta en OTRO gimnasio y apoderarse de ella. Ese camino va
   * por `link()`, autenticado y sin contrasena en el contrato.
   *
   * LIMITACION ASUMIDA (ADR-0010): el usuario lo crea Better Auth con su propia
   * conexion, fuera de nuestra transaccion. Si lo siguiente fallara, quedaria
   * una cuenta sin pertenencia. Es recuperable: la cuenta existe con la
   * contrasena elegida, asi que se puede iniciar sesion y usar `link()`, que
   * completa la operacion. Converge al estado correcto sin intervencion manual.
   */
  async accept(input: AcceptInvitationInput, headers: Headers) {
    const gymId = this.gymIdDelToken(input.token);
    const ahora = new Date();
    const pendiente = await this.buscarPendiente(gymId, input.token);

    // Un solo mensaje para no valida / caducada / usada / revocada: los cuatro
    // casos son "no sirve", y distinguirlos solo ayuda a quien prueba tokens.
    if (!pendiente || pendiente.expiresAt <= ahora) {
      throw new BadRequestException('La invitacion no es valida, ya se uso o ha caducado.');
    }

    if (await this.existeCuenta(pendiente.email)) {
      throw new ConflictException({
        code: ACCOUNT_EXISTS,
        message:
          'Ya existe una cuenta con ese correo. Inicia sesion y vincula la invitacion desde tu cuenta.',
      });
    }

    const signUp = await this.auth.api.signUpEmail({
      body: { name: input.name, email: pendiente.email, password: input.password },
      headers,
      returnHeaders: true,
    });
    const userId = signUp.response.user.id;

    await withTenant(
      this.db,
      gymId,
      async (tx) => {
        // El UPDATE condicionado es lo que hace el token de un solo uso a prueba
        // de carreras: si dos peticiones llegan a la vez, solo una encuentra la
        // fila con `accepted_at` a null y la otra se queda sin filas.
        const marcadas = await tx
          .update(invitations)
          .set({ acceptedAt: ahora })
          .where(and(eq(invitations.id, pendiente.id), isNull(invitations.acceptedAt)))
          .returning({ id: invitations.id });

        if (!marcadas[0]) {
          throw new BadRequestException('La invitacion ya se uso.');
        }

        await tx.insert(memberships).values({ gymId, userId, role: pendiente.role });
        await tx.insert(auditLog).values({
          gymId,
          actorUserId: userId,
          action: 'invitation.accepted',
          entityType: 'invitation',
          entityId: pendiente.id,
        });

        // Punto de extension: `members` rellena aqui su `user_id` y `trainers`
        // crea el perfil. Dentro de ESTA transaccion, para que un fallo al
        // vincular deje tambien la invitacion sin consumir.
        await this.avisarHooks({
          gymId,
          invitationId: pendiente.id,
          memberId: pendiente.memberId,
          role: pendiente.role,
          userId,
          tx,
        });
      },
      { userId },
    );

    // Fijar el gimnasio activo en la sesion no es cosmetico: sin esto, quien
    // acaba de aceptar tiene sesion pero sin tenant, y RolesGuard rechaza con
    // 403 cualquier operacion dentro de su propio gimnasio.
    const token = signUp.response.token ?? '';
    if (token) {
      // Gimnasio activo y caducidad segun el rol, igual que en el login
      // (ADR-0007, decision 8). Sin fijar el gimnasio, quien acaba de aceptar
      // tendria sesion pero sin tenant, y recibiria 403 en su propio gimnasio.
      const duracionMs =
        pendiente.role === 'member' ? 90 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
      await withoutTenant(this.db, (tx) =>
        tx
          .update(sessions)
          .set({ activeGymId: gymId, expiresAt: new Date(Date.now() + duracionMs) })
          .where(eq(sessions.token, token)),
      );
    }

    return { session: { token, activeGymId: gymId }, authHeaders: signUp.headers };
  }

  /**
   * Vincula una invitacion a una cuenta que YA existe (ADR-0010).
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ NO RECIBE CONTRASENA, y eso es la garantia principal del diseno.      │
   * │                                                                      │
   * │ Al no existir el dato en el contrato, este metodo no puede modificar   │
   * │ credenciales ni por un error de programacion. No hay nada con lo que   │
   * │ hacerlo. Es estructural, no una comprobacion que alguien pueda        │
   * │ olvidar — el mismo criterio que llevo a RLS en ADR-0002.              │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * NO usa el gimnasio activo de la sesion: usa el del token. Alguien puede
   * estar dentro del gimnasio 1 y vincular una invitacion del gimnasio 2, y
   * exigirle que cambie de gimnasio antes seria absurdo.
   *
   * Tampoco cambia el gimnasio activo al terminar: quien decide donde opera es
   * la persona, con /switch-gym.
   */
  async link(token: string, userId: string): Promise<{ ok: true; gymId: string }> {
    const gymId = this.gymIdDelToken(token);
    const ahora = new Date();
    const pendiente = await this.buscarPendiente(gymId, token);

    if (!pendiente || pendiente.expiresAt <= ahora) {
      throw new BadRequestException('La invitacion no es valida, ya se uso o ha caducado.');
    }

    // El email de la sesion debe coincidir con el de la invitacion.
    //
    // Sin esto, cualquiera con una cuenta y un token ajeno —un correo
    // reenviado— se daria de alta en un gimnasio al que nadie le invito. La
    // invitacion es para una direccion concreta.
    const [usuario] = await withoutTenant(this.db, (tx) =>
      tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    );
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    if (usuario.email.toLowerCase() !== pendiente.email.toLowerCase()) {
      throw new ForbiddenException(
        'Esta invitacion es para otra direccion de correo. Inicia sesion con esa cuenta.',
      );
    }

    await withTenant(
      this.db,
      gymId,
      async (tx) => {
        // Mismo UPDATE condicionado que en `accept()`: hace el token de un solo
        // uso a prueba de carreras, y ademas entre los DOS endpoints — si uno lo
        // consume, el otro se queda sin filas.
        const marcadas = await tx
          .update(invitations)
          .set({ acceptedAt: ahora })
          .where(and(eq(invitations.id, pendiente.id), isNull(invitations.acceptedAt)))
          .returning({ id: invitations.id });

        if (!marcadas[0]) {
          throw new BadRequestException('La invitacion ya se uso.');
        }

        const yaPertenece = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.gymId, gymId), eq(memberships.userId, userId)))
          .limit(1);

        if (yaPertenece[0]) {
          throw new BadRequestException('Ya perteneces a ese gimnasio.');
        }

        await tx.insert(memberships).values({ gymId, userId, role: pendiente.role });
        await tx.insert(auditLog).values({
          gymId,
          actorUserId: userId,
          action: 'invitation.linked',
          entityType: 'invitation',
          entityId: pendiente.id,
        });

        await this.avisarHooks({
          gymId,
          invitationId: pendiente.id,
          memberId: pendiente.memberId,
          role: pendiente.role,
          userId,
          tx,
        });
      },
      { userId },
    );

    return { ok: true, gymId };
  }

  // --- Interno ----------------------------------------------------------

  /** El gimnasio sale del token, nunca de la peticion (ADR-0007). */
  private gymIdDelToken(token: string): string {
    const gymId = token.split('.')[0] ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(gymId)) {
      throw new BadRequestException('Invitacion no valida.');
    }
    return gymId;
  }

  private async buscarPendiente(gymId: string, token: string) {
    return withTenant(this.db, gymId, async (tx) => {
      const filas = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.tokenHash, hashToken(token)),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .limit(1);
      return filas[0];
    });
  }

  /**
   * Si ese email ya tiene cuenta.
   *
   * Sin contexto de tenant: `users` es identidad global y no lleva RLS. La
   * comparacion es sin distinguir mayusculas, igual que el indice unico.
   */
  private async existeCuenta(email: string): Promise<boolean> {
    const filas = await withoutTenant(this.db, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = lower(${email})`)
        .limit(1),
    );
    return filas.length > 0;
  }

  private toDto(fila: typeof invitations.$inferSelect): Invitation {
    return {
      id: fila.id,
      email: fila.email,
      role: fila.role,
      expiresAt: fila.expiresAt.toISOString(),
      acceptedAt: fila.acceptedAt?.toISOString() ?? null,
      revokedAt: fila.revokedAt?.toISOString() ?? null,
    };
  }
}

/** Hash del token, igual que una contrasena: si la BD se filtra, no es canjeable. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
