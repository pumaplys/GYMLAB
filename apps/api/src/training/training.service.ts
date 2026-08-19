import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  auditLog,
  desc,
  eq,
  exercises,
  count,
  inArray,
  isNull,
  routineAssignments,
  routineItems,
  routines,
  sql,
  type Exercise as ExerciseRow,
  type Routine as RoutineRow,
} from '@gymlab/db';
import type {
  AssignedRoutine,
  OwnRoutine,
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

  // La siembra de la biblioteca al crear un gimnasio vive en
  // `GymExerciseSeeder`, que implementa el punto de extension de alta de
  // gimnasio. Estaba aqui, y obligaba a que `auth` inyectara este servicio.

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
    await this.assertNombreLibre(gymId, input.name);

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
    const actual = await this.buscarEjercicio(gymId, id);

    if (input.name && input.name !== actual.name) {
      await this.assertNombreLibre(gymId, input.name);
    }

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

    return this.armar(gymId, filas);
  }

  async getRoutine(gymId: string, id: string): Promise<Routine> {
    const tx = requireTransaction();
    const [rutina] = await tx
      .select()
      .from(routines)
      .where(and(eq(routines.gymId, gymId), eq(routines.id, id)))
      .limit(1);

    if (!rutina) throw new NotFoundException('Rutina no encontrada.');

    const [armada] = await this.armar(gymId, [rutina]);
    return armada!;
  }

  /**
   * Monta las rutinas con sus ejercicios y sus asignaciones vigentes.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ TRES CONSULTAS EN TOTAL, no tres por rutina.                              │
   * │                                                                          │
   * │ Aqui habia un `Promise.all` que llamaba a `getRoutine` por cada fila: N+1 │
   * │ —cincuenta rutinas eran ciento cincuenta viajes donde bastan tres— y      │
   * │ ademas lanzaba consultas simultaneas sobre la MISMA transaccion, justo lo │
   * │ contrario de la regla que este mismo fichero documentaba unas lineas mas  │
   * │ abajo. No reventaba porque el cliente de `pg` las encola, que es la peor  │
   * │ forma de que un error no se note.                                         │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  private async armar(gymId: string, filas: RoutineRow[]): Promise<Routine[]> {
    if (filas.length === 0) return [];
    const tx = requireTransaction();
    const ids = filas.map((f) => f.id);

    const items = await tx
      .select()
      .from(routineItems)
      .where(and(eq(routineItems.gymId, gymId), inArray(routineItems.routineId, ids)))
      .orderBy(asc(routineItems.position));

    const conteos = await tx
      .select({ routineId: routineAssignments.routineId, n: sql<number>`count(*)::int` })
      .from(routineAssignments)
      .where(
        and(
          eq(routineAssignments.gymId, gymId),
          inArray(routineAssignments.routineId, ids),
          isNull(routineAssignments.endedAt),
        ),
      )
      .groupBy(routineAssignments.routineId);

    const porRutina = new Map(ids.map((id) => [id, [] as Routine['items']]));
    for (const i of items) {
      porRutina.get(i.routineId)?.push({
        id: i.id,
        exerciseId: i.exerciseId,
        exerciseName: i.exerciseName,
        position: i.position,
        sets: i.sets,
        reps: i.reps,
        restSeconds: i.restSeconds,
        notes: i.notes,
      });
    }
    const activas = new Map(conteos.map((c) => [c.routineId, Number(c.n)]));

    return filas.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      items: porRutina.get(f.id) ?? [],
      activeAssignments: activas.get(f.id) ?? 0,
      status: f.status,
    }));
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
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ SOLO SU CREADOR, O EL DUENO. Y este limite salio de una revision.         │
   * │                                                                          │
   * │ Las rutinas se comparten dentro del gimnasio —dos entrenadores usan la    │
   * │ misma "Fuerza principiantes" y duplicarla no tendria sentido—, pero       │
   * │ compartir para leer y asignar no es lo mismo que compartir para borrar:   │
   * │ se comprobo ejecutando que un entrenador podia borrar la rutina de un     │
   * │ companero y llevarse por cascada las asignaciones de socios que no eran   │
   * │ suyos. Irreversible, y sobre gente ajena.                                 │
   * │                                                                          │
   * │ Si la cuenta del creador ya no existe, `created_by_user_id` es nulo y     │
   * │ solo el dueno puede borrarla. Es el desenlace correcto: alguien tiene que │
   * │ poder, y el dueno responde del gimnasio.                                  │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Editar sigue abierto a cualquier entrenador: es compartido por diseno y se
   * puede deshacer. Borrar no.
   */
  /**
   * Retira una rutina del uso SIN tocar su historia.
   *
   * Es la accion normal, y el espejo de `archivePlan`: la rutina se queda
   * entera —ejercicios, notas y asignaciones pasadas— pero deja de poder
   * asignarse. Lo impide `assignRoutine`, no la pantalla.
   *
   * Misma regla de autoria que tenia el borrado: un entrenador solo archiva
   * las suyas, porque puede haber socios de otro entrenador siguiendola.
   *
   * En V1 no se desarchiva. Si hiciera falta volver a usarla, se duplica.
   */
  async archiveRoutine(gymId: string, id: string): Promise<Routine> {
    const tx = requireTransaction();
    const { userId: actorUserId, role } = requireRequestContext();
    const actual = await this.getRoutine(gymId, id);

    if (actual.status === 'archived') {
      throw new BadRequestException('Esa rutina ya esta archivada.');
    }

    if (role === 'trainer') {
      const [rutina] = await tx
        .select({ creador: routines.createdByUserId })
        .from(routines)
        .where(and(eq(routines.gymId, gymId), eq(routines.id, id)))
        .limit(1);

      if (rutina?.creador !== actorUserId) {
        throw new ForbiddenException(
          'Solo puede archivar esta rutina quien la creo, o el dueno del gimnasio. ' +
            'Puede haber socios de otro entrenador siguiendola.',
        );
      }
    }

    await tx
      .update(routines)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(routines.gymId, gymId), eq(routines.id, id)));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'routine.archived',
      entityType: 'routine',
      entityId: id,
    });

    return this.getRoutine(gymId, id);
  }

  async deleteRoutine(gymId: string, id: string): Promise<{ ok: true }> {
    const tx = requireTransaction();
    const { userId: actorUserId, role } = requireRequestContext();
    await this.getRoutine(gymId, id);

    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ BORRAR CASCADEA `routine_assignments`. POR ESO CASI NADIE PUEDE.     │
     * │                                                                      │
     * │ La clave ajena borra en cascada, asi que eliminar una rutina borra   │
     * │ tambien el registro de que un socio la siguio. Eso contradice como   │
     * │ el resto del producto trata el historico, y un entrenador podia      │
     * │ hacerlo sin enterarse.                                                │
     * │                                                                      │
     * │ Queda para el unico caso inofensivo: una rutina creada por error que │
     * │ NUNCA se asigno a nadie. Todo lo demas se archiva.                    │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    if (role !== 'owner') {
      throw new ForbiddenException(
        'Solo el dueno puede borrar una rutina, y solo si nunca se asigno a nadie. ' +
          'Para retirar una rutina en uso, archivala.',
      );
    }

    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(routineAssignments)
      .where(
        and(eq(routineAssignments.gymId, gymId), eq(routineAssignments.routineId, id)),
      );

    // Cualquier asignacion, incluidas las TERMINADAS: lo que se protege es el
    // historico, y una asignacion terminada es exactamente eso.
    if (Number(n) > 0) {
      throw new BadRequestException(
        'Esta rutina se asigno a alguien alguna vez, asi que borrarla eliminaria ese ' +
          'historial. Archivala en su lugar: deja de poder asignarse y se conserva.',
      );
    }

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
    const rutina = await this.getRoutine(gymId, routineId);

    /*
     * En el SERVICIO y no solo en la pantalla, igual que `subscribe` con un
     * plan archivado: si «archivada» solo escondiera un boton, seguiria siendo
     * asignable por API y el estado no significaria nada.
     */
    if (rutina.status === 'archived') {
      throw new BadRequestException(
        'Esa rutina esta archivada y ya no se puede asignar. Duplicala si quieres volver a usarla.',
      );
    }

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
  async myRoutines(gymId: string, userId: string): Promise<OwnRoutine[]> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    const suyas = await this.rutinasDe(gymId, ficha.id);

    /*
     * Se quita `activeAssignments` AQUI, no en la pantalla.
     *
     * Es cuanta gente del gimnasio sigue esa rutina: informacion del negocio,
     * util para quien la escribio y muda para quien solo quiere saber que le
     * toca hoy. Filtrarlo en el frontend lo dejaria viajando por la red igual.
     */
    return suyas.map(({ activeAssignments: _, ...resto }) => resto);
  }

  /**
   * Metricas de rutinas para el panel.
   *
   * Las dos por `DISTINCT` y por el mismo motivo que en entrenadores: una rutina
   * puede estar asignada a muchos socios y un socio puede seguir varias, asi que
   * contar filas de asignacion responderia a una pregunta que nadie hizo.
   */
  async stats(gymId: string) {
    const tx = requireTransaction();
    const res = await tx.execute<{ rutinas: string; socios: string }>(sql`
      SELECT count(DISTINCT routine_id) AS rutinas,
             count(DISTINCT member_id) AS socios
      FROM routine_assignments
      WHERE gym_id = ${gymId} AND ended_at IS NULL
    `);

    const f = res.rows[0];
    return {
      rutinasActivas: Number(f?.rutinas ?? 0),
      sociosConRutina: Number(f?.socios ?? 0),
    };
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

    if (asignadas.length === 0) return [];

    // Se montan TODAS de una vez, con las mismas tres consultas que el listado.
    // Antes esto era un bucle que llamaba a `getRoutine` por asignacion: en
    // serie, si —la transaccion es una— pero igualmente N+1.
    const tx2 = requireTransaction();
    const rutinas = await tx2
      .select()
      .from(routines)
      .where(
        and(eq(routines.gymId, gymId), inArray(routines.id, asignadas.map((a) => a.routineId))),
      );

    const armadas = new Map((await this.armar(gymId, rutinas)).map((r) => [r.id, r]));

    return asignadas.flatMap((a) => {
      const rutina = armadas.get(a.routineId);
      return rutina
        ? [{ ...rutina, assignmentId: a.assignmentId, assignedAt: a.assignedAt.toISOString() }]
        : [];
    });
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

  /**
   * El indice unico ya impide el nombre repetido; el mensaje se da aqui.
   *
   * Sin esto, renombrar un ejercicio al nombre de otro producia un 500 con una
   * violacion de indice, que en el panel no dice nada. Renombrar la copia es de
   * las primeras cosas que hace un gimnasio (ADR-0012), asi que el choque va a
   * pasar. Mismo tratamiento que el email repetido en `members`.
   */
  private async assertNombreLibre(gymId: string, nombre: string): Promise<void> {
    const tx = requireTransaction();
    const [existe] = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.gymId, gymId), eq(exercises.name, nombre)))
      .limit(1);

    if (existe) {
      throw new BadRequestException(`Ya hay un ejercicio llamado "${nombre}" en este gimnasio.`);
    }
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
