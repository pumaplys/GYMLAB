import { API_URL } from '../api/config';

/**
 * Las paginas publicas de RINDA, derivadas de la API y no escritas otra vez.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL DOMINIO SE CALCULA, NO SE REPITE.                                     │
 * │                                                                          │
 * │ `API_URL` ya pasa por `esDeDesarrollo`, que en una build de release       │
 * │ rechaza cualquier direccion de desarrollo y cae al dominio de produccion. │
 * │ Sacando de ahi el origen, estas paginas heredan esa misma defensa: no hay │
 * │ forma de que una build de tienda enlace a `localhost`.                    │
 * │                                                                          │
 * │ Escribir `https://gymlabfit.tech` a mano habria sido un segundo sitio     │
 * │ donde equivocarse el dia que cambie el dominio.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function origenPublico(base: string = API_URL): string {
  try {
    return new URL(base).origin;
  } catch {
    return base.replace(/\/v1\/?$/, '');
  }
}

/** La politica de privacidad de RINDA. NO es el consentimiento del gimnasio. */
export const POLITICA_DE_PRIVACIDAD = `${origenPublico()}/privacidad`;

/** El recurso web de borrado, para quien ya no tenga la app instalada. */
export const ELIMINAR_CUENTA_WEB = `${origenPublico()}/eliminar-cuenta`;

/** Donde se pide ayuda. */
export const SOPORTE = `${origenPublico()}/soporte`;
