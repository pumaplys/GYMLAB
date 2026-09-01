/**
 * Los tipos de la vista previa. SIN datos.
 *
 * Viven aparte para que el fichero que si los tiene pueda ser `.web.ts` y
 * quedarse fuera del paquete nativo. Ver `casos.ts`.
 */
import type { EstadoDeSesion } from '../auth/estado';

/**
 * Como se comporta `entrar()` en este caso.
 *
 * El error y la espera del login viven DENTRO de la pantalla, no en el
 * contexto, asi que la unica forma de verlos sin inventarse el pintado es
 * provocarlos por el camino de verdad.
 */
export type Entrada = 'inerte' | 'falla401' | 'nunca-termina';

/**
 * Un caso es solo un ESTADO de sesion. La pantalla la elige la URL, que es la
 * de verdad: `/inicio?vista=autenticado` monta las pestañas reales.
 */
export interface Caso {
  estado: EstadoDeSesion;
  entrada: Entrada;
}
