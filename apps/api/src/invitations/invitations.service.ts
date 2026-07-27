import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  auditLog,
  eq,
  invitations,
  isNull,
  memberships,
  sessions,
  users,
  withTenant,
  withoutTenant,
  type Database,
} from '@gymlab/db';
import type { AcceptInvitationInput, Invitation, Role } from '@gymlab/contracts';
import { canInvite, EMAIL_QUEUES } from '@gymlab/contracts';
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
  ) {}

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
      url: `${env.API_URL}/accept-invitation?token=${encodeURIComponent(token)}`,
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
   * Acepta una invitacion: crea la cuenta y la pertenencia.
   *
   * Publico, porque quien acepta todavia no tiene sesion.
   *
   * LIMITACION ASUMIDA: el usuario lo crea Better Auth con su propia conexion,
   * fuera de nuestra transaccion. Si lo siguiente fallara, quedaria una cuenta
   * sin pertenencia; la invitacion sigue pendiente y se puede reintentar. No
   * expone datos de nadie.
   */
  async accept(input: AcceptInvitationInput, headers: Headers) {
    const gymId = input.token.split('.')[0] ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(gymId)) {
      throw new BadRequestException('Invitacion no valida.');
    }

    const ahora = new Date();
    const pendiente = await withTenant(this.db, gymId, async (tx) => {
      const filas = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.tokenHash, hashToken(input.token)),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .limit(1);
      return filas[0];
    });

    // Un solo mensaje para no valida / caducada / usada / revocada: los cuatro
    // casos son "no sirve", y distinguirlos solo ayuda a quien prueba tokens.
    if (!pendiente || pendiente.expiresAt <= ahora) {
      throw new BadRequestException('La invitacion no es valida, ya se uso o ha caducado.');
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
      },
      { userId },
    );

    // Fijar el gimnasio activo en la sesion no es cosmetico: sin esto, quien
    // acaba de aceptar tiene sesion pero sin tenant, y RolesGuard rechaza con
    // 403 cualquier operacion dentro de su propio gimnasio.
    const token = signUp.response.token ?? '';
    if (token) {
      await withoutTenant(this.db, (tx) =>
        tx.update(sessions).set({ activeGymId: gymId }).where(eq(sessions.token, token)),
      );
    }

    return { token, activeGymId: gymId };
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
