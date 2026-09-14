import type { ErasurePreview, ErasureResult } from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * El borrado de la propia cuenta: las llamadas de verdad.
 *
 * Envoltorios y no `api.*` suelto en la pantalla, por lo mismo que el resto:
 * es lo que permite que la vista previa web sustituya la fuente sin tocar una
 * pantalla, y lo que mantiene los datos de muestra fuera del binario nativo.
 */
export function consultarBorradoReal(): Promise<ErasurePreview> {
  return api.auth.erasurePreview();
}

export function borrarCuentaReal(): Promise<ErasureResult> {
  return api.auth.eraseAccount();
}
