import { ApiError, ApiResponseError, NetworkError } from '@gymlab/api-client';
import type { Resultado } from './estado';

/**
 * De una excepcion, un resultado. Sin heuristicas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PREGUNTA POR LA CLASE, NO POR LA FORMA DEL OBJETO.                    │
 * │                                                                          │
 * │ La primera version hacia esto:                                           │
 * │                                                                          │
 * │   if (status === 401) return noAutorizado;                               │
 * │   if (typeof status === 'number') return noAutorizado;   // <- el fallo   │
 * │                                                                          │
 * │ o sea: CUALQUIER error con `status` se trataba como sesion invalida. Un  │
 * │ 500, un 429 o un 403 borraban el token y echaban de la app a alguien     │
 * │ cuya sesion seguia siendo valida.                                        │
 * │                                                                          │
 * │ `@gymlab/api-client` ya distingue los tres casos con clases propias y    │
 * │ las exporta, asi que no hay que adivinar nada:                           │
 * │                                                                          │
 * │   ApiError          la API respondio, y respondio que no. Trae `status`. │
 * │   ApiResponseError  respondio 2xx pero el cuerpo no cumple el contrato.  │
 * │   NetworkError      no hubo respuesta: sin red, DNS, servidor caido.     │
 * │                                                                          │
 * │ Y lo desconocido se trata como red: es el unico camino que NO borra el   │
 * │ token, y ante la duda no se cierra una sesion que puede ser buena.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function clasificarError(problema: unknown): Resultado {
  if (problema instanceof ApiError) {
    // El unico status que invalida una sesion.
    if (problema.status === 401) return { clase: 'sesionInvalida' };
    return { clase: 'errorDelServidor', status: problema.status };
  }

  if (problema instanceof ApiResponseError) return { clase: 'respuestaInvalida' };

  if (problema instanceof NetworkError) return { clase: 'errorDeRed' };

  // Cualquier otra cosa —un fallo en nuestro propio codigo, una excepcion que
  // no viene del cliente— se trata como incidencia recuperable. Conservar un
  // token de mas es un inconveniente; borrar uno bueno es echar a alguien.
  return { clase: 'errorDeRed' };
}
