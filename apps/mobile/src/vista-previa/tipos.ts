/**
 * Los tipos de la vista previa. SIN datos.
 *
 * Viven aparte para que el fichero que si los tiene pueda ser `.web.ts` y
 * quedarse fuera del paquete nativo. Ver `casos.ts`.
 */
import type { EstadoDeSesion } from '../auth/estado';

/** Que pantalla monta cada caso. */
export type Pantalla =
  | 'entrar'
  | 'arranque'
  | 'sesion-lista'
  | 'no-admitido'
  | 'problema'
  | 'elegir-gimnasio';

/** Como se comporta `entrar()` en este caso, para poder ver error y carga. */
export type Entrada = 'inerte' | 'falla401' | 'nunca-termina';

export interface Caso {
  pantalla: Pantalla;
  estado: EstadoDeSesion;
  entrada: Entrada;
}
