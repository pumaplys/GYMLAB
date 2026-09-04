import { api } from '../api/cliente';
import type { OwnRoutine } from '@gymlab/contracts';

/**
 * De donde salen las rutinas. La via de verdad.
 *
 * Una sola llamada: `/me/routines` devuelve las vigentes ENTERAS, con sus
 * ejercicios dentro. No hay que pedir el detalle de ninguna, y por eso esta
 * pantalla no necesita una ruta `/rutina/:id`.
 */
export async function cargarRutinasReal(): Promise<readonly OwnRoutine[]> {
  return api.yo.misRutinas();
}
