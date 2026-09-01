import { api } from '../api/cliente';
import type { DuesStatus, Member } from '@gymlab/contracts';
import type { CodigoDeAcceso } from './logica';

/**
 * De donde salen los datos del carne. La via de verdad, la unica que existe
 * en un telefono.
 *
 * Dos llamadas al abrir y una al pulsar. Nada mas: no hay sondeo, no hay
 * refresco en segundo plano y no se pide un codigo que nadie ha pedido.
 */
export interface DatosDelCarne {
  ficha: Member;
  cuota: DuesStatus;
}

export async function cargarCarneReal(): Promise<DatosDelCarne> {
  const [ficha, cuota] = await Promise.all([api.yo.fichaDeSocio(), api.yo.miCuota()]);
  return { ficha, cuota };
}

/**
 * Pide un codigo nuevo.
 *
 * `POST /me/access/token`. Cada llamada devuelve uno distinto, dura 60
 * segundos y se consume al escanearlo. El token se devuelve y ya: quien lo
 * recibe lo guarda en memoria y en ningun sitio mas.
 */
export async function pedirCodigoReal(): Promise<CodigoDeAcceso> {
  const acceso = await api.yo.tokenDeAcceso();
  return { token: acceso.token, expiresAt: acceso.expiresAt };
}
