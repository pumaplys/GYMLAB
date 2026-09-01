/**
 * De donde sale el token de sesion en la app movil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ESTA EN `set-auth-token`. ESTA EN EL CUERPO, Y SIEMPRE ESTUVO.        │
 * │                                                                          │
 * │ El plan de partida era el camino documentado de Better Auth: el plugin   │
 * │ `bearer()` —que la API tiene activado a proposito para movil, ver        │
 * │ `auth.instance.ts`— emite el token en una cabecera `set-auth-token`.     │
 * │                                                                          │
 * │ COMPROBADO contra la API local, y NO llega: la respuesta de              │
 * │ `POST /v1/auth/login` trae `set-cookie` y ninguna cabecera de token. El  │
 * │ motivo esta en `apps/api/src/common/http.ts`: `forwardAuthCookies` copia │
 * │ a la respuesta de Nest unicamente las cabeceras `Set-Cookie` de Better   │
 * │ Auth, y la del token se queda por el camino.                            │
 * │                                                                          │
 * │ Buscando alternativas aparecio la buena: `sessionResponseSchema` —el     │
 * │ contrato que ya devuelve el login— DECLARA un campo `token`. Es decir,   │
 * │ el token viaja en el cuerpo, tipado y validado, desde antes de que       │
 * │ existiera esta app.                                                      │
 * │                                                                          │
 * │ COMPROBADO de extremo a extremo contra la API local:                     │
 * │                                                                          │
 * │   /v1/auth/me      sin credencial          -> 401                        │
 * │   /v1/auth/me      con el token del cuerpo -> 200                        │
 * │   /v1/me/dues      con el token del cuerpo -> 200                        │
 * │   /v1/me/routines  con el token del cuerpo -> 200                        │
 * │   logout y despues /auth/me                -> 401                        │
 * │                                                                          │
 * │ Las cuatro barreras de ADR-0007 aceptan el token por cabecera, y cerrar  │
 * │ sesion lo invalida de verdad.                                            │
 * │                                                                          │
 * │ CONSECUENCIA PRACTICA: no hace falta un transporte propio para el login  │
 * │ ni leer `set-cookie` —que en un navegador seria imposible y en React     │
 * │ Native funciona por casualidad—. Se usa `@gymlab/api-client` tal cual.   │
 * │ El backend no se toca.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { createApiClient, type ApiClient } from '@gymlab/api-client';
import { leerToken } from '../auth/almacen';
import { crearFetchAutenticado } from './fetch-autenticado';
import { API_URL } from './config';

/**
 * El cliente de la app: el de siempre, con el fetch que lleva la sesion.
 *
 * `createHttp` acepta un `fetch` inyectado —la costura ya existia— asi que
 * `@gymlab/api-client` no necesita ni una linea nueva para funcionar aqui.
 */
export const api: ApiClient = createApiClient({
  baseUrl: API_URL,
  // Aqui es donde el almacen se ata al transporte: el fichero de arriba no
  // conoce SecureStore, y por eso sus reglas se pueden probar sin mocks.
  fetch: crearFetchAutenticado(leerToken),
});
