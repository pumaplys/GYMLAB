/**
 * El `fetch` que lleva la sesion.
 *
 * Se inyecta en `createHttp({ baseUrl, fetch })` de `@gymlab/api-client`, que
 * ya preve exactamente esta costura. El paquete NO se toca: sigue haciendo lo
 * suyo —validar contra contratos, tipar errores— y aqui solo se le cambia el
 * transporte por debajo.
 *
 * Tres reglas, y las tres tienen prueba propia en `fetch-autenticado.test.ts`:
 *
 *   1. las cabeceras que ya trae la peticion NO se pierden;
 *   2. sin token no se inventa una cabecera `Authorization` vacia;
 *   3. si la peticion ya trae `Authorization`, se respeta la suya.
 */
/**
 * El tipo lo pone `@gymlab/api-client`, no este fichero.
 *
 * Declararlo aqui a partir de `typeof fetch` no vale: el `fetch` de React
 * Native esta tipado mas estrecho que el del DOM —no admite `URL` como
 * entrada— y el resultado no encajaba en `createApiClient`. Usando el tipo
 * del paquete que lo va a recibir, encaja por construccion.
 */
import type { Fetch as FetchLike } from '@gymlab/api-client';

export type { FetchLike };

/**
 * Lo que hace falta del fetch de abajo: una firma, no las tres sobrecargas.
 *
 * `Fetch` viene sobrecargado y eso lo hace incomodo de SATISFACER —un doble de
 * pruebas no encaja—. Como parametro basta con esto; lo que si tiene que
 * cumplir el tipo completo es lo que se DEVUELVE, que es lo que recibe
 * `createApiClient`.
 */
export type FetchBase = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Construye el fetch autenticado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE FICHERO NO IMPORTA `expo-secure-store`, Y ES DELIBERADO.           │
 * │                                                                          │
 * │ El lector de token llega como PARAMETRO obligatorio en lugar de tener    │
 * │ por defecto el del almacen. Asi este modulo no depende de React Native   │
 * │ —`expo-secure-store` arrastra `react-native`, que esta escrito en Flow y │
 * │ ningun runner de pruebas de JavaScript sabe leer— y sus reglas se pueden │
 * │ probar tal cual, sin mocks y sin entorno nativo.                         │
 * │                                                                          │
 * │ Quien ata el cabo es `cliente.ts`, que es donde se compone la app.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function crearFetchAutenticado(
  obtenerToken: () => Promise<string | null>,
  fetchBase: FetchBase = (input, init) => globalThis.fetch(input, init),
): FetchLike {
  return async function fetchAutenticado(input, init) {
    const token = await obtenerToken();

    // `Headers` normaliza los nombres y admite las tres formas en que se pueden
    // haber escrito las cabeceras de entrada (objeto, array o `Headers`).
    const cabeceras = new Headers(init?.headers);

    // Solo se anade si hay token Y no venia ya una: quien pide algo con una
    // credencial concreta sabe mejor que nosotros cual quiere usar.
    if (token && !cabeceras.has('authorization')) {
      cabeceras.set('authorization', `Bearer ${token}`);
    }

    return fetchBase(input, { ...init, headers: cabeceras });
  };
}
