import {
  legalDataSchema,
  privacyDocumentStatusSchema,
  type LegalData,
  type PrivacyDocumentStatus,
  type UpdateLegalDataInput,
} from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * Identidad juridica del responsable y estado de su documento de privacidad.
 *
 * Son dos rutas y no una porque las sirven modulos distintos: la identidad vive
 * en `organizations` y el documento en las tablas de consentimiento. Unirlas en
 * una sola respuesta obligaria a que uno de los dos leyera las tablas del otro,
 * que es justo lo que ADR-0006 prohibe.
 */
export interface LegalApi {
  /** Datos del responsable, con los campos que falten por rellenar. */
  get(gymId: string, options?: RequestOptions): Promise<LegalData>;
  update(
    gymId: string,
    input: UpdateLegalDataInput,
    options?: RequestOptions,
  ): Promise<LegalData>;
  /** Si hay documento publicado y, si no, por que motivo concreto. */
  documentStatus(gymId: string, options?: RequestOptions): Promise<PrivacyDocumentStatus>;
}

export function createLegalApi(http: Http): LegalApi {
  const legal = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}/legal`;

  return {
    get: (gymId, options) =>
      http({ method: 'GET', path: legal(gymId), schema: legalDataSchema, ...options }),

    update: (gymId, input, options) =>
      http({
        method: 'PATCH',
        path: legal(gymId),
        body: input,
        schema: legalDataSchema,
        ...options,
      }),

    documentStatus: (gymId, options) =>
      http({
        method: 'GET',
        path: `/gyms/${encodeURIComponent(gymId)}/privacy-document`,
        schema: privacyDocumentStatusSchema,
        ...options,
      }),
  };
}
