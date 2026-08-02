import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  auditLog,
  eq,
  isNull,
  members,
  sql,
  trainerAssignments,
  trainers,
  users,
  type Trainer as TrainerRow,
} from '@gymlab/db';
import type {
  AssignedMember,
  Member,
  Trainer,
  TrainerAssignment,
  UpdateTrainerInput,
} from '@gymlab/contracts';
import { requireRequestContext, requireTransaction } from '../common/request-context';
import { memberToDto } from '../members/member.mapper';

/**
 * Entrenadores y sus asignaciones.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI VIVE UN LIMITE DE SEGURIDAD QUE RLS NO CUBRE.                        │
 * │                                                                          │
 * │ RLS aisla entre gimnasios. Dentro de uno no distingue roles: el           │
 * │ entrenador y el dueno son el mismo `gymlab_app` para PostgreSQL. Que un   │
 * │ entrenador vea SOLO a sus socios asignados lo decide este servicio, y por │
 * │ eso todos los metodos del bloque "el entrenador y sus socios" parten del  │
 * │ `userId` de la sesion y nunca de un id que venga en la peticion.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * No hay alta de entrenador: se invita con rol `trainer` y el perfil lo crea
 * `TrainerProfileLink` al aceptarse. Un perfil sin cuenta no serviria de nada.
 */
@Injectable()
export class TrainersService {
  // --- Vista del personal --------------------------------------------------

  async list(gymId: string): Promise<Trainer[]> {
    const tx = requireTransaction();
    const filas = await tx
      .select(this.columnas())
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(eq(trainers.gymId, gymId))
      .orderBy(users.name);

    return filas.map((f) => this.toDto(f));
  }

  async getById(gymId: string, id: string): Promise<Trainer> {
    return this.toDto(await this.buscarConCuenta(gymId, id));
  }

  async update(gymId: string, id: string, input: UpdateTrainerInput): Promise<Trainer> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    await this.buscar(gymId, id);

    await tx
      .update(trainers)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(trainers.gymId, gymId), eq(trainers.id, id)));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'trainer.updated',
      entityType: 'trainer',
      entityId: id,
      metadata: { campos: Object.keys(input) },
    });

    return this.getById(gymId, id);
  }

  /**
   * Da de baja a un entrenador Y TERMINA SUS ASIGNACIONES.
   *
   * Lo segundo es la parte discutible, asi que conviene dejar escrito el porque.
   *
   * La alternativa era rechazar la baja mientras tuviera socios y obligar a
   * reasignarlos antes. Suena mas prudente y en la practica es peor: cuando un
   * entrenador se va de un dia para otro, el dueno se encuentra con que no puede
   * darle de baja hasta hacer doce reasignaciones a mano, y mientras tanto sigue
   * apareciendo como activo.
   *
   * Terminarlas no pierde nada —queda `ended_at`, no se borra ninguna fila— y
   * deja a esos socios visiblemente sin entrenador, que es la situacion real.
   * Reactivar al entrenador NO las restaura: volver a asignar es una decision,
   * no un efecto secundario.
   */
  async deactivate(gymId: string, id: string): Promise<{ trainer: Trainer; liberados: number }> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const actual = await this.buscar(gymId, id);

    if (actual.status === 'inactive') {
      throw new BadRequestException('Ese entrenador ya esta de baja.');
    }

    const ahora = new Date();
    await tx
      .update(trainers)
      .set({ status: 'inactive', updatedAt: ahora })
      .where(and(eq(trainers.gymId, gymId), eq(trainers.id, id)));

    const terminadas = await tx
      .update(trainerAssignments)
      .set({ endedAt: ahora, updatedAt: ahora })
      .where(
        and(
          eq(trainerAssignments.gymId, gymId),
          eq(trainerAssignments.trainerId, id),
          isNull(trainerAssignments.endedAt),
        ),
      )
      .returning({ id: trainerAssignments.id });

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'trainer.deactivated',
      entityType: 'trainer',
      entityId: id,
      metadata: { asignacionesTerminadas: terminadas.length },
    });

    return { trainer: await this.getById(gymId, id), liberados: terminadas.length };
  }

  async reactivate(gymId: string, id: string): Promise<Trainer> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const actual = await this.buscar(gymId, id);

    if (actual.status === 'active') {
      throw new BadRequestException('Ese entrenador ya esta activo.');
    }

    await tx
      .update(trainers)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(trainers.gymId, gymId), eq(trainers.id, id)));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'trainer.reactivated',
      entityType: 'trainer',
      entityId: id,
    });

    return this.getById(gymId, id);
  }

  // --- Asignaciones --------------------------------------------------------

  async assign(gymId: string, trainerId: string, memberId: string): Promise<TrainerAssignment> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    const entrenador = await this.buscar(gymId, trainerId);
    if (entrenador.status !== 'active') {
      throw new BadRequestException('Ese entrenador esta de baja.');
    }

    const [socio] = await tx
      .select({ status: members.status })
      .from(members)
      .where(and(eq(members.gymId, gymId), eq(members.id, memberId)))
      .limit(1);

    if (!socio) throw new NotFoundException('Socio no encontrado.');
    if (socio.status !== 'active') {
      throw new BadRequestException('Ese socio esta de baja.');
    }

    // El indice unico parcial ya lo impediria, pero un 400 explicando el motivo
    // es mejor que un error de base de datos.
    const [vigente] = await tx
      .select({ id: trainerAssignments.id })
      .from(trainerAssignments)
      .where(
        and(
          eq(trainerAssignments.gymId, gymId),
          eq(trainerAssignments.trainerId, trainerId),
          eq(trainerAssignments.memberId, memberId),
          isNull(trainerAssignments.endedAt),
        ),
      )
      .limit(1);

    if (vigente) {
      throw new BadRequestException('Ese socio ya esta asignado a ese entrenador.');
    }

    const [fila] = await tx
      .insert(trainerAssignments)
      .values({ gymId, trainerId, memberId, assignedByUserId: actorUserId })
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'trainer.assigned',
      entityType: 'trainer_assignment',
      entityId: fila!.id,
      metadata: { trainerId, memberId },
    });

    return this.asignacionToDto(fila!);
  }

  /** Termina la asignacion vigente. No borra la fila: el historial se conserva. */
  async endAssignment(gymId: string, trainerId: string, memberId: string): Promise<void> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const ahora = new Date();

    const terminadas = await tx
      .update(trainerAssignments)
      .set({ endedAt: ahora, updatedAt: ahora })
      .where(
        and(
          eq(trainerAssignments.gymId, gymId),
          eq(trainerAssignments.trainerId, trainerId),
          eq(trainerAssignments.memberId, memberId),
          isNull(trainerAssignments.endedAt),
        ),
      )
      .returning({ id: trainerAssignments.id });

    if (!terminadas[0]) {
      throw new NotFoundException('No hay ninguna asignacion vigente entre esos dos.');
    }

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'trainer.unassigned',
      entityType: 'trainer_assignment',
      entityId: terminadas[0].id,
      metadata: { trainerId, memberId },
    });
  }

  /** Los socios de un entrenador, visto por el personal. */
  async listMembersOf(gymId: string, trainerId: string): Promise<AssignedMember[]> {
    await this.buscar(gymId, trainerId);
    return this.asignados(gymId, trainerId);
  }

  // --- El entrenador y sus socios ------------------------------------------

  async getOwnProfile(gymId: string, userId: string): Promise<Trainer> {
    return this.toDto(await this.buscarConCuenta(gymId, await this.miTrainerId(gymId, userId)));
  }

  async updateOwnProfile(
    gymId: string,
    userId: string,
    input: UpdateTrainerInput,
  ): Promise<Trainer> {
    return this.update(gymId, await this.miTrainerId(gymId, userId), input);
  }

  /**
   * Los socios que tengo asignados.
   *
   * PARTE DEL `userId` DE LA SESION, nunca de un id de la peticion: no hay
   * ningun parametro con el que un entrenador pueda pedir la lista de otro.
   */
  async myMembers(gymId: string, userId: string): Promise<AssignedMember[]> {
    return this.asignados(gymId, await this.miTrainerId(gymId, userId));
  }

  /**
   * La ficha de UN socio mio.
   *
   * Si no esta entre mis asignados, 404 y no 403: confirmar que la ficha existe
   * ya seria filtrar informacion sobre socios ajenos.
   */
  async myMember(gymId: string, userId: string, memberId: string): Promise<AssignedMember> {
    const trainerId = await this.miTrainerId(gymId, userId);
    const [socio] = await this.asignados(gymId, trainerId, memberId);

    if (!socio) throw new NotFoundException('Ese socio no esta entre los que tienes asignados.');
    return socio;
  }

  // --- Interno -------------------------------------------------------------

  /**
   * Del `userId` de la sesion a su perfil de entrenador en este gimnasio.
   *
   * Es el unico punto por el que se entra a los metodos del entrenador, y por
   * eso es el sitio natural de la comprobacion: sin perfil, no hay nada que ver.
   */
  private async miTrainerId(gymId: string, userId: string): Promise<string> {
    const tx = requireTransaction();
    const [fila] = await tx
      .select({ id: trainers.id })
      .from(trainers)
      .where(and(eq(trainers.gymId, gymId), eq(trainers.userId, userId)))
      .limit(1);

    if (!fila) throw new NotFoundException('No tienes perfil de entrenador en este gimnasio.');
    return fila.id;
  }

  /**
   * Socios ACTIVOS con asignacion vigente. El filtro de autorizacion.
   *
   * LA ASIGNACION SOBREVIVE A LA BAJA DEL SOCIO, pero no se muestra. Es la misma
   * idea que hace que dar de baja no borre la ficha: cuando esa persona vuelve
   * —y en un gimnasio vuelven—, recupera a su entrenador sin que nadie tenga que
   * acordarse de reasignarla.
   *
   * Excluirla aqui y no al darla de baja resuelve ademas una incoherencia: se
   * rechaza asignar a un socio de baja, asi que verlo en la lista por haberse
   * dado de baja despues era contradictorio.
   */
  private async asignados(
    gymId: string,
    trainerId: string,
    memberId?: string,
  ): Promise<AssignedMember[]> {
    const tx = requireTransaction();

    const condiciones = [
      eq(trainerAssignments.gymId, gymId),
      eq(trainerAssignments.trainerId, trainerId),
      isNull(trainerAssignments.endedAt),
      eq(members.status, 'active'),
    ];
    if (memberId) condiciones.push(eq(trainerAssignments.memberId, memberId));

    const filas = await tx
      .select({
        socio: members,
        assignmentId: trainerAssignments.id,
        assignedAt: trainerAssignments.assignedAt,
      })
      .from(trainerAssignments)
      .innerJoin(members, eq(members.id, trainerAssignments.memberId))
      .where(and(...condiciones))
      .orderBy(members.lastName, members.firstName);

    return filas.map((f) => ({
      ...(memberToDto(f.socio) satisfies Member),
      assignmentId: f.assignmentId,
      assignedAt: f.assignedAt.toISOString(),
    }));
  }

  private async buscar(gymId: string, id: string): Promise<TrainerRow> {
    const tx = requireTransaction();
    const [fila] = await tx
      .select()
      .from(trainers)
      .where(and(eq(trainers.gymId, gymId), eq(trainers.id, id)))
      .limit(1);

    // RLS ya impide ver entrenadores de otro gimnasio: llegaria como 404, que es
    // lo correcto — no confirmamos la existencia de perfiles ajenos.
    if (!fila) throw new NotFoundException('Entrenador no encontrado.');
    return fila;
  }

  private async buscarConCuenta(gymId: string, id: string) {
    const tx = requireTransaction();
    const [fila] = await tx
      .select(this.columnas())
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(and(eq(trainers.gymId, gymId), eq(trainers.id, id)))
      .limit(1);

    if (!fila) throw new NotFoundException('Entrenador no encontrado.');
    return fila;
  }

  /**
   * Nombre y email salen de `users`, no de `trainers`.
   *
   * `users` no lleva RLS a proposito (el login precede al contexto de gimnasio),
   * asi que este JOIN no queda filtrado. El acotado lo pone el `gym_id` de
   * `trainers`, que si tiene politica.
   */
  private columnas() {
    return {
      id: trainers.id,
      name: users.name,
      email: users.email,
      bio: trainers.bio,
      phone: trainers.phone,
      status: trainers.status,
      createdAt: trainers.createdAt,
      // Cuenta lo MISMO que devuelve `asignados()`: asignacion vigente y socio
      // activo. Si las dos consultas se separan, el panel muestra un numero que
      // no coincide con la lista, que es de los fallos que peor se explican.
      //
      // OJO AL SUMAR ESTA COLUMNA: un socio con dos entrenadores cuenta en los
      // dos. Para "socios atendidos" en el dashboard hara falta un
      // COUNT(DISTINCT member_id), no la suma de estos contadores.
      activeMembers: sql<number>`(
        SELECT count(*) FROM trainer_assignments ta
        JOIN members m ON m.id = ta.member_id
        WHERE ta.trainer_id = ${trainers.id}
          AND ta.ended_at IS NULL
          AND m.status = 'active'
      )::int`.as('active_members'),
    };
  }

  private toDto(fila: {
    id: string;
    name: string;
    email: string;
    bio: string | null;
    phone: string | null;
    status: TrainerRow['status'];
    createdAt: Date;
    activeMembers: number;
  }): Trainer {
    return {
      id: fila.id,
      name: fila.name,
      email: fila.email,
      bio: fila.bio,
      phone: fila.phone,
      status: fila.status,
      activeMembers: Number(fila.activeMembers),
      createdAt: fila.createdAt.toISOString(),
    };
  }

  private asignacionToDto(fila: {
    id: string;
    trainerId: string;
    memberId: string;
    assignedAt: Date;
    endedAt: Date | null;
  }): TrainerAssignment {
    return {
      id: fila.id,
      trainerId: fila.trainerId,
      memberId: fila.memberId,
      assignedAt: fila.assignedAt.toISOString(),
      endedAt: fila.endedAt?.toISOString() ?? null,
    };
  }
}
