import { api } from '../api/cliente';
import type { BodyMetric, OwnRoutine } from '@gymlab/contracts';
import type { DatosEsenciales } from './logica';

/**
 * De donde salen los datos de Inicio. La via de verdad.
 *
 * Tres funciones y no una: es lo que permite que un fallo en las rutinas no
 * arrastre al saludo. Quien llama decide que hacer con cada una.
 */
export async function cargarEsencialesReal(): Promise<DatosEsenciales> {
  const [ficha, cuota] = await Promise.all([api.yo.fichaDeSocio(), api.yo.miCuota()]);
  return { ficha, cuota };
}

export async function cargarRutinasReal(): Promise<readonly OwnRoutine[]> {
  return api.yo.misRutinas();
}

export async function cargarProgresoReal(): Promise<readonly BodyMetric[]> {
  return api.yo.miProgreso();
}
