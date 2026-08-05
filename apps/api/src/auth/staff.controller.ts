import { Controller, Delete, ForbiddenException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { AuthService } from './auth.service';

/**
 * Retirar el acceso de una persona a un gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE ESTE ENDPOINT VIVE EN `auth` Y NO EN UN MODULO PROPIO            │
 * │                                                                          │
 * │ Opera sobre `memberships`, que es de `identity` — y `identity` no expone │
 * │ servicio de aplicacion. La desviacion ya esta documentada en ADR-0006 y  │
 * │ declarada en el guardarrail de fronteras: `auth` e `invitations` son los │
 * │ dos modulos autorizados a tocar esa tabla. Crear un modulo nuevo para    │
 * │ una operacion seria ampliar la superficie sin ganar nada.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Solo el dueno.** Invitar y retirar no son simetricos: recepcion incorpora
 * entrenadores y puede deshacer sus errores revocando invitaciones pendientes,
 * pero cortarle el acceso a alguien ya incorporado es decision de direccion.
 *
 * La ruta identifica a la persona por su `userId`, no por el id de la fila de
 * pertenencia: es el dato que el panel ya tiene y evita exponer un
 * identificador interno que no le hace falta a nadie.
 */
@Controller('gyms/:gymId/staff')
export class StaffController {
  constructor(private readonly auth: AuthService) {}

  @Roles('owner')
  @Delete(':userId')
  revoke(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const ctx = requireRequestContext();

    // El gimnasio de la ruta se compara con el de la sesion, que es el que
    // manda. Sin esto, el dueno de A podria escribir el id de B en la URL: RLS
    // lo frenaria despues, pero devolviendo un error de base de datos en lugar
    // de un 403 (ADR-0007).
    if (ctx.gymId !== gymId) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }

    return this.auth.revokeAccess(ctx.gymId, ctx.userId, userId);
  }
}
