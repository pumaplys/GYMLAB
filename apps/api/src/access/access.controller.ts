import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  listAccessEventsQuerySchema,
  updateGymSettingsSchema,
  verifyAccessSchema,
  type UpdateGymSettingsInput,
  type VerifyAccessInput,
} from '@gymlab/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { AccessService } from './access.service';
import { GymSettingsService } from './gym-settings.service';

/**
 * El socio genera su propio QR.
 *
 * Ruta sin `:memberId`, como el resto de `/me/...`: la ficha se localiza por el
 * `user_id` de la sesion, asi que no hay ningun identificador con el que pedir el
 * QR de otra persona. Si lo hubiera, cualquiera podria fabricarse la entrada de
 * un socio al corriente.
 */
@Controller('me/access')
export class OwnAccessController {
  constructor(private readonly access: AccessService) {}

  @Post('token')
  token() {
    const ctx = requireRequestContext();
    if (!ctx.gymId) {
      throw new ForbiddenException('Necesitas un gimnasio activo. Usa /v1/auth/switch-gym.');
    }
    return this.access.generarToken(ctx.gymId, ctx.userId);
  }
}

/**
 * El escaner de recepcion.
 *
 * El entrenador no aparece: quien controla la puerta es el personal de mostrador.
 * Y el socio tampoco, evidentemente — validar el propio QR seria abrirse la
 * puerta uno mismo.
 */
@Controller('gyms/:gymId/access')
@Roles('owner', 'receptionist')
export class AccessController {
  constructor(
    private readonly access: AccessService,
    private readonly settings: GymSettingsService,
  ) {}

  @Post('verify')
  verify(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body(new ZodBody(verifyAccessSchema)) body: VerifyAccessInput,
  ) {
    return this.access.verificar(this.gym(gymId), body.token);
  }

  @Get('events')
  events(@Param('gymId', ParseUUIDPipe) gymId: string, @Query() query: unknown) {
    return this.access.listarEventos(this.gym(gymId), listAccessEventsQuerySchema.parse(query));
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
 * Ajustes del gimnasio. Solo el dueno.
 *
 * Existen dos que hasta ahora solo vivian en la base de datos y nadie podia
 * cambiar sin una migracion: los dias de cortesia de las cuotas y los meses de
 * retencion de los accesos. Un ajuste que hay que pedir por correo al proveedor
 * no es configurable, es una constante con mas pasos.
 */
@Controller('gyms/:gymId/settings')
@Roles('owner')
export class GymSettingsController {
  constructor(private readonly settings: GymSettingsService) {}

  @Get()
  get(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.settings.get(this.gym(gymId));
  }

  @Patch()
  update(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body(new ZodBody(updateGymSettingsSchema)) body: UpdateGymSettingsInput,
  ) {
    return this.settings.update(this.gym(gymId), body);
  }

  private gym(gymIdRuta: string): string {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymIdRuta) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return ctx.gymId;
  }
}
