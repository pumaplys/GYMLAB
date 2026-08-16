import { z } from 'zod';
import {
  bodyMetricSchema,
  healthConsentStatusSchema,
  type BodyMetric,
  type HealthConsentStatus,
  type RecordBodyMetricInput,
} from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * Peso y medidas de un socio. Datos de salud (RGPD art. 9).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO HAY AQUI NI OTORGAR NI REVOCAR EL CONSENTIMIENTO.                     │
 * │                                                                          │
 * │ La API los tiene —`POST` y `DELETE` sobre `health-consent`, abiertos a   │
 * │ dueno y entrenador— pero ninguna pantalla los usa, y un metodo sin       │
 * │ consumidor no se ejecuta nunca.                                          │
 * │                                                                          │
 * │ Ademas es la decision de producto para v1: el entrenador RESPETA el      │
 * │ consentimiento, no lo concede en nombre del socio. Que el servidor se lo │
 * │ permitiera no lo convierte en algo que deba poder hacer desde su area.   │
 * │ Recogerlo y revocarlo se resuelve donde corresponda, no aqui.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface ProgresoApi {
  /**
   * El historial de mediciones, de la mas reciente a la mas antigua.
   *
   * LEER NO EXIGE CONSENTIMIENTO VIGENTE, y no es un olvido: si el socio lo
   * revoca o cambia el texto legal, el gimnasio tiene que poder seguir viendo lo
   * que recogio legitimamente para atender una peticion de acceso o de borrado.
   * Lo que se cierra al revocar son las escrituras.
   *
   * 404 si el socio no esta entre los asignados de quien pregunta.
   */
  historial(gymId: string, memberId: string, options?: RequestOptions): Promise<BodyMetric[]>;

  /**
   * Registra una medicion.
   *
   * Exige al menos una medida; todas son opcionales por separado porque casi
   * nadie mide todo. Sin consentimiento vigente responde 403 con el codigo
   * `CONSENT_REQUIRED`, o `CONSENT_NOT_CONFIGURED` si el gimnasio todavia no
   * tiene texto legal.
   */
  registrar(
    gymId: string,
    memberId: string,
    input: RecordBodyMetricInput,
    options?: RequestOptions,
  ): Promise<BodyMetric>;

  /**
   * En que situacion esta el consentimiento de este socio.
   *
   * `currentVersion` es `null` cuando no hay ninguna version configurada: no es
   * que el socio no haya aceptado, es que todavia no hay nada que aceptar.
   */
  consentimientoDeSalud(
    gymId: string,
    memberId: string,
    options?: RequestOptions,
  ): Promise<HealthConsentStatus>;
}

export function createProgresoApi(http: Http): ProgresoApi {
  const raiz = (gymId: string, memberId: string) =>
    `/gyms/${encodeURIComponent(gymId)}/members/${encodeURIComponent(memberId)}`;

  return {
    historial: (gymId, memberId, options) =>
      http({
        method: 'GET',
        path: `${raiz(gymId, memberId)}/progress`,
        schema: z.array(bodyMetricSchema),
        ...options,
      }),

    registrar: (gymId, memberId, input, options) =>
      http({
        method: 'POST',
        path: `${raiz(gymId, memberId)}/progress`,
        body: input,
        schema: bodyMetricSchema,
        ...options,
      }),

    consentimientoDeSalud: (gymId, memberId, options) =>
      http({
        method: 'GET',
        path: `${raiz(gymId, memberId)}/health-consent`,
        schema: healthConsentStatusSchema,
        ...options,
      }),
  };
}
