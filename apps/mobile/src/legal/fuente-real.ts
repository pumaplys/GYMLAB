import type { LegalData, PrivacyDocumentStatus, UpdateLegalDataInput } from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * Configuración legal y estado del documento de privacidad: las llamadas de verdad.
 *
 * Envoltorios y no `api.*` suelto en las pantallas: es lo que permite que la
 * vista previa web sustituya la fuente sin tocar una pantalla, y lo que
 * mantiene los datos de muestra fuera del binario nativo.
 */

export function cargarLegalReal(gymId: string): Promise<LegalData> {
  return api.legal.get(gymId);
}

export function guardarLegalReal(gymId: string, cambios: UpdateLegalDataInput): Promise<LegalData> {
  return api.legal.update(gymId, cambios);
}

export function cargarDocumentoReal(gymId: string): Promise<PrivacyDocumentStatus> {
  return api.legal.documentStatus(gymId);
}
