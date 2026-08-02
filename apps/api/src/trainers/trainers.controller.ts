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
  assignMemberSchema,
  updateTrainerSchema,
  type AssignMemberInput,
  type UpdateTrainerInput,
} from '@gymlab/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { TrainersService } from './trainers.service';

/**
 * Los entrenadores vistos por el personal del gimnasio.
 *
 * NO HAY `POST /trainers`: un entrenador no se da de alta, se invita con rol
 * `trainer` desde `POST /gyms/:gymId/invitations` y su perfil aparece cuando
 * acepta. Un perfil sin cuenta detras no serviria para nada, porque el
 * entrenador existe para entrar a ver a sus socios.
 *
 * Editar y dar de baja son del dueno; consultar y asignar tambien de recepcion,
 * que es quien reparte los socios en el mostrador.
 */
@Controller('gyms/:gymId/trainers')
export class TrainersController {
  constructor(private readonly trainers: TrainersService) {}

  @Roles('owner', 'receptionist')
  @Get()
  list(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.trainers.list(this.gym(gymId));
  }

  @Roles('owner', 'receptionist')
  @Get(':id')
  getById(@Param('gymId', ParseUUIDPipe) gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.trainers.getById(this.gym(gymId), id);
  }

  @Roles('owner')
  @Patch(':id')
  update(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(updateTrainerSchema)) body: UpdateTrainerInput,
  ) {
    return this.trainers.update(this.gym(gymId), id, body);
  }

  @Roles('owner')
  @Post(':id/deactivate')
  deactivate(@Param('gymId', ParseUUIDPipe) gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.trainers.deactivate(this.gym(gymId), id);
  }

  @Roles('owner')
  @Post(':id/reactivate')
  reactivate(@Param('gymId', ParseUUIDPipe) gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.trainers.reactivate(this.gym(gymId), id);
  }

  @Roles('owner', 'receptionist')
  @Get(':id/members')
  listMembers(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trainers.listMembersOf(this.gym(gymId), id);
  }

  @Roles('owner', 'receptionist')
  @Post(':id/members')
  assign(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(assignMemberSchema)) body: AssignMemberInput,
  ) {
    return this.trainers.assign(this.gym(gymId), id, body.memberId);
  }

  @Roles('owner', 'receptionist')
  @Delete(':id/members/:memberId')
  async unassign(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    await this.trainers.endAssignment(this.gym(gymId), id, memberId);
    return { ok: true };
  }

  /** El `gymId` de la ruta se compara con el de la sesion, que es el que manda. */
  private gym(gymIdRuta: string): string {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymIdRuta) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return ctx.gymId;
  }
}

/**
 * El entrenador y sus propios socios.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RUTA APARTE Y SIN `:trainerId`, igual que /me/member-profile.             │
 * │                                                                          │
 * │ El entrenador nunca pasa por una URL con el identificador de otro         │
 * │ entrenador, asi que no hay ningun parametro con el que probar suerte. Su  │
 * │ perfil se localiza por el `user_id` de su sesion.                        │
 * │                                                                          │
 * │ Podria haberse resuelto anadiendo el rol `trainer` a los endpoints del    │
 * │ personal y filtrando dentro. Se descarto: bastaria olvidar el filtro en   │
 * │ un endpoint futuro para abrir la lista entera del gimnasio. Aqui el rol   │
 * │ `trainer` no aparece en ninguna ruta del personal.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * LIMITACION CONOCIDA: cada persona tiene un rol por gimnasio, asi que un dueno
 * que ademas entrene no puede tener socios asignados. Se acepta en el MVP;
 * resolverlo es apilar roles, que es un cambio del modelo de permisos.
 */
@Controller('me/trainer')
@Roles('trainer')
export class OwnTrainerController {
  constructor(private readonly trainers: TrainersService) {}

  @Get()
  getProfile() {
    const ctx = requireRequestContext();
    return this.trainers.getOwnProfile(this.gymActivo(), ctx.userId);
  }

  @Patch()
  updateProfile(@Body(new ZodBody(updateTrainerSchema)) body: UpdateTrainerInput) {
    const ctx = requireRequestContext();
    return this.trainers.updateOwnProfile(this.gymActivo(), ctx.userId, body);
  }

  @Get('members')
  myMembers() {
    const ctx = requireRequestContext();
    return this.trainers.myMembers(this.gymActivo(), ctx.userId);
  }

  @Get('members/:memberId')
  myMember(@Param('memberId', ParseUUIDPipe) memberId: string) {
    const ctx = requireRequestContext();
    return this.trainers.myMember(this.gymActivo(), ctx.userId, memberId);
  }

  private gymActivo(): string {
    const ctx = requireRequestContext();
    if (!ctx.gymId) {
      throw new ForbiddenException('Necesitas un gimnasio activo. Usa /v1/auth/switch-gym.');
    }
    return ctx.gymId;
  }
}
