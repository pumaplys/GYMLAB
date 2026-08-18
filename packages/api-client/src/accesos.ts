import {
  accessEventListSchema,
  accessResultSchema,
  type AccessEventList,
  type AccessResult,
  type ListAccessEventsQuery,
} from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * El escaner del mostrador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO ES LO QUE FALTABA PARA QUE EL CARNE DEL SOCIO SIRVIERA DE ALGO.    │
 * │                                                                          │
 * │ El endpoint de verificacion existe desde el modulo de acceso y se probo   │
 * │ en produccion durante #76 —con `curl`—, pero no habia forma de llamarlo   │
 * │ desde el producto: ni cliente ni pantalla. El socio generaba su QR y     │
 * │ nadie podia validarlo.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El socio NO aparece aqui: validar tu propio QR seria abrirte la puerta tu
 * mismo. Su lado esta en `yo.tokenDeAcceso` y `yo.misAccesos`.
 */
export interface AccesosApi {
  /**
   * Consume un token y devuelve la decision de la puerta.
   *
   * **No es idempotente en el sentido habitual.** El backend tolera que el
   * MISMO escaner repita el mismo token durante unos segundos —un fallo de red
   * no debe cobrarle dos entradas a nadie— y devuelve entonces la misma
   * decision marcada como reintento. Pasado ese margen, o desde otro escaner,
   * el mismo token es `TOKEN_REUSED`. Quien llame no debe reimplementar nada de
   * esto: la regla vive en el servidor.
   */
  verify(gymId: string, token: string, options?: RequestOptions): Promise<AccessResult>;

  /** El historial de accesos del gimnasio, paginado. */
  events(
    gymId: string,
    query?: Partial<ListAccessEventsQuery>,
    options?: RequestOptions,
  ): Promise<AccessEventList>;
}

export function createAccesosApi(http: Http): AccesosApi {
  const base = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}/access`;

  return {
    verify: (gymId, token, options) =>
      http({
        method: 'POST',
        path: `${base(gymId)}/verify`,
        body: { token },
        schema: accessResultSchema,
        ...options,
      }),

    events: (gymId, query, options) =>
      http({
        method: 'GET',
        path: `${base(gymId)}/events`,
        query: { memberId: query?.memberId, page: query?.page, pageSize: query?.pageSize },
        schema: accessEventListSchema,
        ...options,
      }),
  };
}
