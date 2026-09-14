import { Body, Controller, Delete, Get, UnauthorizedException } from '@nestjs/common';
import { eraseAccountSchema, type EraseAccountInput } from '@gymlab/contracts';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { AccountErasureService } from './account-erasure.service';
import { Reautenticacion } from './reautenticacion';

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
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DOS PUERTAS, Y NO SON LA MISMA.                                         │
 * │                                                                          │
 * │ Escribir «ELIMINAR» en la pantalla confirma la INTENCION. La contraseña  │
 * │ actual confirma la IDENTIDAD, y se comprueba AQUI: la primera puerta es  │
 * │ de la interfaz y se puede saltar llamando a la API; la segunda no.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sin periodo de gracia: no es una desactivacion. Cuando responde, la cuenta ya
 * no existe y todas sus sesiones —en todos los dispositivos— han caido con
 * ella.
 */
@Controller('me')
export class AccountErasureController {
  constructor(
    private readonly borrado: AccountErasureService,
    private readonly reautenticacion: Reautenticacion,
  ) {}

  /**
   * Que pasaria si lo pidiera. Sin efectos.
   *
   * La pantalla lo consulta ANTES de ofrecer el boton para poder decir «este
   * gimnasio se quedaria sin dueño» con el nombre delante, en vez de dejar que
   * la persona escriba su contraseña y se lleve un no.
   *
   * NO pide la contraseña: no cambia nada y solo devuelve informacion sobre la
   * propia cuenta, que la sesion ya autoriza a ver.
   */
  @Get('erasure-preview')
  async preview() {
    const { userId } = requireRequestContext();
    const bloqueos = await this.borrado.bloqueos(userId);
    return { puedeBorrarse: bloqueos.length === 0, bloqueos };
  }

  @Delete()
  async borrar(@Body(new ZodBody(eraseAccountSchema)) body: EraseAccountInput) {
    const { userId } = requireRequestContext();

    /*
     * ANTES de mirar bloqueos y antes de tocar nada: si la contraseña no es la
     * suya, esta peticion no llega a saber siquiera de cuantos gimnasios es
     * dueña. Un 401 aqui no filtra nada.
     */
    if (!(await this.reautenticacion.esLaContrasenaActual(userId, body.password))) {
      throw new UnauthorizedException('La contraseña no es correcta.');
    }

    return this.borrado.borrar(userId);
  }
}
