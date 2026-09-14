import { Controller, Delete, Get } from '@nestjs/common';
import { requireRequestContext } from '../common/request-context';
import { AccountErasureService } from './account-erasure.service';

/**
 * Borrar la propia cuenta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO LLEVA `:userId`, Y ESA ES LA GARANTIA PRINCIPAL.                     │
 * │                                                                          │
 * │ La cuenta que se borra sale SIEMPRE de la sesion. Al no existir el dato  │
 * │ en la ruta ni en el cuerpo, este endpoint no puede borrar la cuenta de   │
 * │ otra persona ni por un error de programacion — es la misma garantia que  │
 * │ ya se aplico en `link-invitation`.                                       │
 * │                                                                          │
 * │ El borrado del personal por parte de un dueño sigue siendo otra cosa y   │
 * │ vive en otro sitio: aquello retira el ACCESO, esto borra la IDENTIDAD.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sin periodo de gracia: no es una desactivacion. Cuando responde, la cuenta ya
 * no existe y todas sus sesiones —en todos los dispositivos— han caido con
 * ella.
 */
@Controller('me')
export class AccountErasureController {
  constructor(private readonly borrado: AccountErasureService) {}

  /**
   * Que pasaria si lo pidiera. Sin efectos.
   *
   * La pantalla lo consulta ANTES de ofrecer el boton para poder decir «este
   * gimnasio se quedaria sin dueño» con el nombre delante, en vez de dejar que
   * la persona escriba la confirmacion y se lleve un no.
   */
  @Get('erasure-preview')
  async preview() {
    const { userId } = requireRequestContext();
    const bloqueos = await this.borrado.bloqueos(userId);
    return { puedeBorrarse: bloqueos.length === 0, bloqueos };
  }

  @Delete()
  async borrar() {
    const { userId } = requireRequestContext();
    return this.borrado.borrar(userId);
  }
}
