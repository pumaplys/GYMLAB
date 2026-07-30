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
  Query,
} from '@nestjs/common';
import {
  createMemberNoteSchema,
  createMemberSchema,
  listMembersQuerySchema,
  updateMemberSchema,
  updateOwnProfileSchema,
  type CreateMemberInput,
  type CreateMemberNoteInput,
  type ListMembersQuery,
  type UpdateMemberInput,
  type UpdateOwnProfileInput,
} from '@gymlab/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { MembersService } from './members.service';

/**
 * Endpoints del personal sobre las fichas de socio.
 *
 * EL ENTRENADOR NO APARECE en ningun `@Roles` de este controlador, y es
 * deliberado: debe ver solo *sus* socios asignados, y las asignaciones llegan en
 * el modulo siguiente. Darle acceso a todos "provisionalmente" es de esas cosas
 * provisionales que se quedan.
 *
 * Tampoco puede anadir notas todavia: para eso necesitaria un `member_id`, que
 * solo se obtiene del listado. Un permiso inutilizable es peor que ninguno.
 */
@Controller('gyms/:gymId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Roles('owner', 'receptionist')
  @Post()
  create(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body(new ZodBody(createMemberSchema)) body: CreateMemberInput,
  ) {
    return this.members.create(this.gym(gymId), body);
  }

  @Roles('owner', 'receptionist')
  @Get()
  list(@Param('gymId', ParseUUIDPipe) gymId: string, @Query() query: unknown) {
    const parsed = listMembersQuerySchema.parse(query) satisfies ListMembersQuery;
    return this.members.list(this.gym(gymId), parsed);
  }

  @Roles('owner', 'receptionist')
  @Get(':id')
  getById(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.members.getById(this.gym(gymId), id);
  }

  @Roles('owner', 'receptionist')
  @Patch(':id')
  update(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    return this.members.update(this.gym(gymId), id, body);
  }

  @Roles('owner', 'receptionist')
  @Post(':id/deactivate')
  deactivate(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.members.deactivate(this.gym(gymId), id);
  }

  @Roles('owner', 'receptionist')
  @Post(':id/reactivate')
  reactivate(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.members.reactivate(this.gym(gymId), id);
  }

  /**
   * Invita al socio a crear su cuenta.
   *
   * Dar de alta e invitar son dos acciones distintas: un gimnasio tiene socios
   * que nunca tendran cuenta, y la ficha existe sin ella.
   */
  @Roles('owner', 'receptionist')
  @Post(':id/invite')
  invite(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.members.invite(this.gym(gymId), id);
  }

  @Roles('owner', 'receptionist')
  @Post(':id/notes')
  addNote(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(createMemberNoteSchema)) body: CreateMemberNoteInput,
  ) {
    return this.members.addNote(this.gym(gymId), id, body.body);
  }

  @Roles('owner', 'receptionist')
  @Get(':id/notes')
  listNotes(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.members.listNotes(this.gym(gymId), id);
  }

  /** Solo el dueno: una exportacion es la ficha entera de una persona. */
  @Roles('owner')
  @Get(':id/export')
  exportData(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.members.exportData(this.gym(gymId), id);
  }

  /** Solo el dueno: es destructivo e irreversible. */
  @Roles('owner')
  @Delete(':id')
  erase(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.members.erase(this.gym(gymId), id);
  }

  /**
   * El `gymId` de la ruta se compara con el de la sesion, que es el que manda.
   *
   * Sin esto, recepcion del gimnasio A podria escribir otro id en la URL. RLS lo
   * frenaria despues, pero devolviendo un error de base de datos en lugar de un
   * 403 — y descansar en eso es lo que ADR-0007 queria evitar.
   */
  private gym(gymIdRuta: string): string {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymIdRuta) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return ctx.gymId;
  }
}

/**
 * El socio y sus propios datos.
 *
 * Ruta aparte y SIN `:gymId` a proposito: el socio nunca pasa por una URL con
 * identificador de gimnasio ni de ficha, asi que no hay nada con lo que pueda
 * probar suerte. Su ficha se localiza por el `user_id` de su sesion.
 */
@Controller('me/member-profile')
export class OwnMemberProfileController {
  constructor(private readonly members: MembersService) {}

  @Get()
  get() {
    const ctx = requireRequestContext();
    return this.members.getOwnProfile(this.gymActivo(), ctx.userId);
  }

  @Patch()
  update(@Body(new ZodBody(updateOwnProfileSchema)) body: UpdateOwnProfileInput) {
    const ctx = requireRequestContext();
    return this.members.updateOwnProfile(this.gymActivo(), ctx.userId, body);
  }

  private gymActivo(): string {
    const ctx = requireRequestContext();
    if (!ctx.gymId) {
      throw new ForbiddenException('Necesitas un gimnasio activo. Usa /v1/auth/switch-gym.');
    }
    return ctx.gymId;
  }
}
