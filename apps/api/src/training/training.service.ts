import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  auditLog,
  desc,
  eq,
  exercises,
  inArray,
  isNull,
  routineAssignments,
  routineItems,
  routines,
  sql,
  type Exercise as ExerciseRow,
  type Transaction,
} from '@gymlab/db';
import type {
  AssignedRoutine,
  CreateExerciseInput,
  CreateRoutineInput,
  Exercise,
  Routine,
  RoutineItemInput,
  UpdateExerciseInput,
  UpdateRoutineInput,
} from '@gymlab/contracts';
import { requireRequestContext, requireTransaction } from '../common/request-context';
import { MembersService } from '../members/members.service';
import { TrainersService } from '../trainers/trainers.service';

/**
 * Ejercicios, rutinas y su asignacion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ENTRENADOR SOLO ASIGNA RUTINAS A SUS SOCIOS.                           │
 * │                                                                          │
 * │ RLS no puede imponerlo —dentro de un gimnasio no distingue roles—, asi    │
 * │ que se apoya en el modulo de entrenadores: `myMember()` responde 404 si   │
 * │ ese socio no esta entre sus asignados. Reutilizar ese filtro en lugar de  │
 * │ escribir otro es deliberado: dos copias de una regla de autorizacion      │
 * │ acaban divergiendo, y la que se olvide sera la insegura.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class TrainingService {
  constructor(
    private readonly members: MembersService,
    private readonly trainers: TrainersService,
  ) {}

  // --- La biblioteca del gimnasio ------------------------------------------

  /**
   * Copia el catalogo de la plataforma a un gimnasio recien creado (ADR-0012).
   *
   * RECIBE LA TRANSACCION explicitamente, igual que el hook de invitaciones y
   * por el mismo motivo: se llama desde el alta del gimnasio, que ocurre fuera
   * del ciclo normal de peticion autenticada y no tiene contexto que consultar.
   * Pasarla obliga ademas a que la siembra viva dentro de la misma transaccion
   * que crea el gimnasio: o hay gimnasio con biblioteca, o no hay gimnasio.
   *
   * `ON CONFLICT DO NOTHING` sobre (gym_id, name) la hace idempotente: si se
   * llamara dos veces, el gimnasio no acaba con la biblioteca duplicada.
   */
  async seedFromTemplates(gymId: string, transaccion?: Transaction): Promise<number> {
    const tx = transaccion ?? requireTransaction();
    const resultado = await tx.execute(sql`
      INSERT INTO exercises (gym_id, template_id, name, muscle_group, equipment)
      SELECT ${gymId}, t.id, t.name, t.muscle_group, t.equipment
      FROM exercise_templates t
      ON CONFLICT (gym_id, name) DO NOTHING
    `);
    return resultado.rowCount ?? 0;
  }

  async listExercises(gymId: string): Promise<Exercise[]> {
    const tx = requireTransaction();
    const filas = await tx
      .select()
      .from(exercises)
      .where(eq(exercises.gymId, gymId))
      .orderBy(exercises.muscleGroup, exercises.name);

    return filas.map((f) => this.ejercicioToDto(f));
  }

  async createExercise(gymId: string, input: CreateExerciseInput): Promise<Exercise> {
    const tx = requireTransaction();
    const [fila] = await tx
      .insert(exercises)
      .values({
        gymId,
        name: input.name,
        muscleGroup: input.muscleGroup,
        equipment: input.equipment ?? null,
      })
      .returning();

    return this.ejercicioToDto(fila!);
  }

  async updateExercise(
    gymId: string,
    id: string,
    input: UpdateExerciseInput,
  ): Promise<Exercise> {
    const tx = requireTransaction();
    await this.buscarEjercicio(gymId, id);

    const [fila] = await tx
      .update(exercises)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(exercises.gymId, gymId), eq(exercises.id, id)))
      .returning();

    return this.ejercicioToDto(fila!);
  }

  /**
   * Borra un ejercicio de la biblioteca del gimnasio.
   *
   * SIN RESTRICCIONES, y es la promesa de ADR-0012. Las rutinas que lo usaban no
   * se rompen: guardan una copia del nombre, asi que siguen diciendo
   * "Prensa 4x10" aunque la ficha ya no exista. La clave ajena anula solo
   * `exercise_id`.
   */
  async deleteExercise(gymId: string, id: string): Promise<{ ok: true }> {
    const tx = requireTransaction();
    await this.buscarEjercicio(gymId, id);

    await tx.delete(exercises).where(and(eq(exercises.gymId, gymId), eq(exercises.id, id)));
    return { ok: true };
  }

  // --- Rutinas -------------------------------------------------------------

  async createRoutine(gymId: string, input: CreateRoutineInput): Promise<Routine> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    const [rutina] = await tx
      .insert(routines)
      .values({
        gymId,
        name: input.name,
        description: input.description ?? null,
        createdByUserId: actorUserId,
      })
      .returning();

    await this.reemplazarItems(gymId, rutina!.id, input.items);

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'routine.created',
      entityType: 'routine',
      entityId: rutina!.id,
      metadata: { ejercicios: input.items.length },
    });

    return this.getRoutine(gymId, rutina!.id);
  }

  async listRoutines(gymId: string): Promise<Routine[]> {
    const tx = requireTransaction();
    const filas = await tx
      .select()
      .from(routines)
      .where(eq(routines.gymId, gymId))
      .orderBy(desc(routines.createdAt));

    return Promise.all(filas.map((f) => this.getRoutine(gymId, f.id)));
  }

  async getRoutine(gymId: string, id: string): Promise<Routine> {
    const tx = requireTransaction();
    const [rutina] = await tx
      .select()
      .from(routines)
      .where(and(eq(routines.gymId, gymId), eq(routines.id, id)))
      .limit(1);

    if (!rutina) throw new NotFoundException('Rutina no encontrada.');

    const items = await tx
      .select()
      .from(routineItems)
      .where(and(eq(routineItems.gymId, gymId), eq(routineItems.routineId, id)))
      .orderBy(asc(routineItems.position));

    const [activas] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(routineAssignments)
      .where(
        and(
          eq(routineAssignments.gymId, gymId),
          eq(routineAssignments.routineId, id),
          isNull(routineAssignments.endedAt),
        ),
      );

    return {
      id: rutina.id,
      name: rutina.name,
      description: rutina.description,
      items: items.map((i) => ({
        id: i.id,
        exerciseId: i.exerciseId,
        exerciseName: i.exerciseName,
        position: i.position,
        sets: i.sets,
        reps: i.reps,
        restSeconds: i.restSeconds,
        notes: i.notes,
      })),
      activeAssignments: Number(activas?.n ?? 0),
    };
  }

  async updateRoutine(gymId: string, id: string, input: UpdateRoutineInput): Promise<Routine> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    await this.getRoutine(gymId, id);

    if (input.name !== undefined || input.description !== undefined) {
      await tx
        .update(routines)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(routines.gymId, gymId), eq(routines.id, id)));
    }

    // Editar la lista la reemplaza entera. Quien la edita tiene la rutina
    // completa en pantalla, asi que reconstruirla es mas simple —y menos
    // propenso a huecos de orden— que un juego de altas y bajas parciales.
    if (input.items) await this.reemplazarItems(gymId, id, input.items);

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'routine.updated',
      entityType: 'routine',
      entityId: id,
      metadata: { campos: Object.keys(input) },
    });

    return this.getRoutine(gymId, id);
  }

  /**
   * Borra una rutina. Sus asignaciones se van en cascada.
   *
   * A diferencia de las asignaciones de entrenador, aqui no se conserva
   * historial: una rutina borrada no es informacion que el gimnasio necesite, y
   * el seguimiento del modulo 6 registrara series hechas, no prescripciones.
   */
  async deleteRoutine(gymId: string, id: string): Promise<{ ok: true }> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    await this.getRoutine(gymId, id);

    await tx.delete(routines).where(and(eq(routines.gymId, gymId), eq(routines.id, id)));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'routine.deleted',
      entityType: 'routine',
      entityId: id,
    });

    return { ok: true };
  }

  // --- Asignaciones --------------------------------------------------------

  /**
   * Asigna una rutina a un socio.
   *
   * Si quien asigna es entrenador, el socio TIENE que ser suyo. La comprobacion
   * se delega en el modulo de entrenadores para no tener dos copias de la misma
   * regla.
   */
  async assignRoutine(gymId: string, routineId: string, memberId: string): Promise<void> {
    const tx = requireTransaction();
    const { userId: actorUserId, role } = requireRequestContext();
    await this.getRoutine(gymId, routineId);

    let trainerId: string | null = null;
    if (role === 'trainer') {
      // Lanza 404 si ese socio no esta entre sus asignados.
      await this.trainers.myMember(gymId, actorUserId, memberId);
      trainerId = (await this.trainers.getOwnProfile(gymId, actorUserId)).id;
    } else {
      const socio = await this.members.getById(gymId, memberId);
      if (socio.status !== 'active') throw new BadRequestException('Ese socio esta de baja.');
    }

    const [vigente] = await tx
      .select({ id: routineAssignments.id })
      .from(routineAssignments)
      .where(
        and(
          eq(routineAssignments.gymId, gymId),
          eq(routineAssignments.routineId, routineId),
          eq(routineAssignments.memberId, memberId),
          isNull(routineAssignments.endedAt),
        ),
      )
      .limit(1);

    if (vigente) throw new BadRequestException('Ese socio ya sigue esa rutina.');

    const [fila] = await tx
      .insert(routineAssignments)
      .values({ gymId, routineId, memberId, assignedByTrainerId: trainerId })
      .returning({ id: routineAssignments.id });

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'routine.assigned',
      entityType: 'routine_assignment',
      entityId: fila!.id,
      metadata: { routineId, memberId },
    });
  }

  /** Termina la asignacion vigente. No borra la fila. */
  async endAssignment(gymId: string, routineId: string, memberId: string): Promise<void> {
    const tx = requireTransaction();
    const { userId: actorUserId, role } = requireRequestContext();

    if (role === 'trainer') await this.trainers.myMember(gymId, actorUserId, memberId);

    const terminadas = await tx
      .update(routineAssignments)
      .set({ endedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(routineAssignments.gymId, gymId),
          eq(routineAssignments.routineId, routineId),
          eq(routineAssignments.memberId, memberId),
          isNull(routineAssignments.endedAt),
        ),
      )
      .returning({ id: routineAssignments.id });

    if (!terminadas[0]) {
      throw new NotFoundException('Ese socio no sigue esa rutina.');
    }

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'routine.unassigned',
      entityType: 'routine_assignment',
      entityId: terminadas[0].id,
      metadata: { routineId, memberId },
    });
  }

  /** Las rutinas vigentes de un socio, visto por el personal. */
  async listMemberRoutines(gymId: string, memberId: string): Promise<AssignedRoutine[]> {
    const { userId, role } = requireRequestContext();
    if (role === 'trainer') await this.trainers.myMember(gymId, userId, memberId);
    else await this.members.getById(gymId, memberId);

    return this.rutinasDe(gymId, memberId);
  }

  /**
   * Mis rutinas, como socio.
   *
   * Parte del `userId` de la sesion: no hay parametro con el que pedir las de
   * otro.
   */
  async myRoutines(gymId: string, userId: string): Promise<AssignedRoutine[]> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    return this.rutinasDe(gymId, ficha.id);
  }

  // --- Interno -------------------------------------------------------------

  private async rutinasDe(gymId: string, memberId: string): Promise<AssignedRoutine[]> {
    const tx = requireTransaction();
    const asignadas = await tx
      .select({
        assignmentId: routineAssignments.id,
        routineId: routineAssignments.routineId,
        assignedAt: routineAssignments.assignedAt,
      })
      .from(routineAssignments)
      .where(
        and(
          eq(routineAssignments.gymId, gymId),
          eq(routineAssignments.memberId, memberId),
          isNull(routineAssignments.endedAt),
        ),
      )
      .orderBy(desc(routineAssignments.assignedAt));

    const resultado: AssignedRoutine[] = [];
    // En serie: todas leen de la MISMA transaccion de la peticion, y una conexion
    // de node-postgres no admite sentencias simultaneas.
    for (const a of asignadas) {
      resultado.push({
        ...(await this.getRoutine(gymId, a.routineId)),
        assignmentId: a.assignmentId,
        assignedAt: a.assignedAt.toISOString(),
      });
    }
    return resultado;
  }

  /**
   * Reescribe la lista de ejercicios de una rutina.
   *
   * COPIA EL NOMBRE de cada ejercicio en el momento de anadirlo. Es lo que
   * permite que el gimnasio borre ejercicios sin dejar rutinas con huecos, y el
   * mismo criterio por el que una suscripcion guarda el precio del plan.
   */
  private async reemplazarItems(
    gymId: string,
    routineId: string,
    items: RoutineItemInput[],
  ): Promise<void> {
    const tx = requireTransaction();

    const ids = items.map((i) => i.exerciseId);
    const encontrados = await tx
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(and(eq(exercises.gymId, gymId), inArray(exercises.id, ids)));

    const porId = new Map(encontrados.map((e) => [e.id, e.name]));
    const desconocido = ids.find((id) => !porId.has(id));
    if (desconocido) {
      // RLS ya impide ver ejercicios de otro gimnasio: llegan aqui como
      // inexistentes, que es la respuesta correcta.
      throw new BadRequestException('Algun ejercicio no existe en este gimnasio.');
    }

    await tx
      .delete(routineItems)
      .where(and(eq(routineItems.gymId, gymId), eq(routineItems.routineId, routineId)));

    await tx.insert(routineItems).values(
      items.map((item, indice) => ({
        gymId,
        routineId,
        exerciseId: item.exerciseId,
        exerciseName: porId.get(item.exerciseId)!,
        position: indice + 1,
        sets: item.sets,
        reps: item.reps,
        restSeconds: item.restSeconds ?? null,
        notes: item.notes ?? null,
      })),
    );
  }

  private async buscarEjercicio(gymId: string, id: string): Promise<ExerciseRow> {
    const tx = requireTransaction();
    const [fila] = await tx
      .select()
      .from(exercises)
      .where(and(eq(exercises.gymId, gymId), eq(exercises.id, id)))
      .limit(1);

    if (!fila) throw new NotFoundException('Ejercicio no encontrado.');
    return fila;
  }

  private ejercicioToDto(fila: ExerciseRow): Exercise {
    return {
      id: fila.id,
      name: fila.name,
      muscleGroup: fila.muscleGroup,
      equipment: fila.equipment,
      fromTemplate: fila.templateId !== null,
    };
  }
}
