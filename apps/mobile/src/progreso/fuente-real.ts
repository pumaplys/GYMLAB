import { api } from '../api/cliente';
import type { BodyMetric } from '@gymlab/contracts';

/**
 * De donde salen las mediciones. La via de verdad.
 *
 * Una sola llamada, y SIN paginacion: `/me/progress` devuelve el historial
 * entero ordenado por `measured_at DESC`. El servidor no aplica ningun limite
 * —comprobado en `progress.service.ts`— asi que lo que llega es todo.
 */
export async function cargarProgresoReal(): Promise<readonly BodyMetric[]> {
  return api.yo.miProgreso();
}
