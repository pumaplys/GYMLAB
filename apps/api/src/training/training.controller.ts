import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  assignRoutineSchema,
  createExerciseSchema,
  createRoutineSchema,
  updateExerciseSchema,
  updateRoutineSchema,
  type AssignRoutineInput,
  type CreateExerciseInput,
  type CreateRoutineInput,
  type UpdateExerciseInput,
  type UpdateRoutineInput,
} from '@gymlab/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { TrainingService } from './training.service';

/**
 * La biblioteca de ejercicios del gimnasio.
 *
 * Dueno y entrenador. Recepcion no: quien decide como se entrena no es quien
 * atiende el mostrador, y darle permiso solo aumentaria la superficie sin que
 * nadie lo pidiera.
 */
@Controller('gyms/:gymId/exercises')
@Roles('owner', 'trainer')
export class ExercisesController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  list(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.training.listExercises(this.gym(gymId));
  }

  @Post()
  create(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body(new ZodBody(createExerciseSchema)) body: CreateExerciseInput,
  ) {
    return this.training.createExercise(this.gym(gymId), body);
  }

  @Patch(':id')
  update(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(updateExerciseSchema)) body: UpdateExerciseInput,
  ) {
    return this.training.updateExercise(this.gym(gymId), id, body);
  }

  /** Sin restricciones: las rutinas conservan el nombre copiado (ADR-0012). */
  @Delete(':id')
  remove(@Param('gymId', ParseUUIDPipe) gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.deleteExercise(this.gym(gymId), id);
  }

  private gym(gymIdRuta: string): string {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymIdRuta) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return ctx.gymId;
  }
}

/**
 * Rutinas y su asignacion.
 *
 * El entrenador entra aqui, y es la primera vez que aparece en una ruta con
 * `:gymId` — hasta ahora solo tenia `/me/trainer/...`. Se admite porque las
 * rutinas son de todo el gimnasio, no de un entrenador: dos entrenadores
 * comparten la plantilla "Fuerza principiantes" y no tendria sentido duplicarla.
 *
 * LO QUE NO SE COMPARTE ES A QUIEN SE LE ASIGNA: ahi el servicio exige que el
 * socio sea suyo, reutilizando el filtro del modulo de entrenadores.
 */
@Controller('gyms/:gymId/routines')
@Roles('owner', 'trainer')
export class RoutinesController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  list(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.training.listRoutines(this.gym(gymId));
  }

  @Get(':id')
  getById(@Param('gymId', ParseUUIDPipe) gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.getRoutine(this.gym(gymId), id);
  }

  @Post()
  create(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body(new ZodBody(createRoutineSchema)) body: CreateRoutineInput,
  ) {
    return this.training.createRoutine(this.gym(gymId), body);
  }

  @Patch(':id')
  update(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(updateRoutineSchema)) body: UpdateRoutineInput,
  ) {
    return this.training.updateRoutine(this.gym(gymId), id, body);
  }

  /** La forma normal de retirar una rutina: conserva su historia. */
  @Post(':id/archive')
  archive(@Param('gymId', ParseUUIDPipe) gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.archiveRoutine(this.gym(gymId), id);
  }

  /**
   * Borrado de verdad. Solo el dueno, y solo si NUNCA se asigno a nadie.
   *
   * Cascadea `routine_assignments`, asi que en cualquier otro caso destruiria
   * historial. El servicio lo rechaza con un 400 que remite a archivar.
   */
  @Delete(':id')
  remove(@Param('gymId', ParseUUIDPipe) gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.deleteRoutine(this.gym(gymId), id);
  }

  @Post(':id/members')
  async assign(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(assignRoutineSchema)) body: AssignRoutineInput,
  ) {
    await this.training.assignRoutine(this.gym(gymId), id, body.memberId);
    return { ok: true };
  }

  @Delete(':id/members/:memberId')
  async unassign(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    await this.training.endAssignment(this.gym(gymId), id, memberId);
    return { ok: true };
  }

  private gym(gymIdRuta: string): string {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymIdRuta) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return ctx.gymId;
  }
}

/** Las rutinas vigentes de un socio, para el personal que puede verlas. */
@Controller('gyms/:gymId/members/:memberId/routines')
@Roles('owner', 'trainer')
export class MemberRoutinesController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  list(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymId) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return this.training.listMemberRoutines(ctx.gymId, memberId);
  }
}

/**
 * El socio y sus rutinas.
 *
 * Sin `:memberId`, como el resto de `/me/...`: se localiza por el `user_id` de la
 * sesion, asi que no hay identificador con el que mirar la rutina de otro.
 */
@Controller('me/routines')
export class OwnRoutinesController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  list() {
    const ctx = requireRequestContext();
    if (!ctx.gymId) {
      throw new ForbiddenException('Necesitas un gimnasio activo. Usa /v1/auth/switch-gym.');
    }
    return this.training.myRoutines(ctx.gymId, ctx.userId);
  }
}
