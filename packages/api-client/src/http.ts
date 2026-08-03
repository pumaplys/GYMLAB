import type { ZodType } from 'zod';
import { ApiError, ApiResponseError, NetworkError, type FieldIssue } from './errors';

/**
 * La implementacion de `fetch` que usa el cliente.
 *
 * Se puede sustituir —y es lo unico que se puede sustituir— para que los tests
 * no necesiten ni red ni servidor.
 */
export type Fetch = typeof globalThis.fetch;

export interface ApiClientOptions {
  /**
   * Base de todas las rutas, version incluida.
   *
   * En produccion es **relativa** (`/v1`), porque el panel y la API se sirven
   * bajo el mismo origen: es el supuesto sobre el que se apoya el modelo de
   * sesion y no una preferencia de configuracion. En desarrollo el panel corre
   * en el 3000 y la API en el 3001, asi que ahi es absoluta.
   */
  baseUrl: string;
  /** Solo para tests. En la aplicacion se deja el `fetch` del entorno. */
  fetch?: Fetch;
}

/** Lo que toda llamada acepta ademas de sus propios argumentos. */
export interface RequestOptions {
  /**
   * Para cancelar. Una pantalla que se desmonta o una busqueda que se reescribe
   * mientras la anterior sigue en vuelo.
   *
   * Al abortar, la promesa se rechaza con el `AbortError` del entorno tal cual:
   * no se envuelve en `NetworkError` porque cancelar no es fallar.
   */
  signal?: AbortSignal;
}

type QueryValue = string | number | boolean | undefined;

interface HttpRequest<T> {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Empieza por `/` y va sin la base. Ej: `/auth/login`. */
  path: string;
  /** Esquema de `@gymlab/contracts` contra el que se valida la respuesta. */
  schema: ZodType<T>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

export type Http = <T>(peticion: HttpRequest<T>) => Promise<T>;

/**
 * El transporte. Una sola funcion, y todo lo que este paquete garantiza pasa
 * por aqui:
 *
 *  1. la cookie de sesion viaja en cada peticion,
 *  2. un error de la API llega tipado y con sus mensajes por campo,
 *  3. **ninguna respuesta se devuelve sin haberse validado contra su contrato**.
 *
 * Los modulos de dominio (`auth`, `members`...) no hacen nada mas que declarar
 * ruta, entrada y esquema de salida. Si alguno llamara a `fetch` por su cuenta,
 * las tres garantias dejarian de ser ciertas para esa llamada.
 */
export function createHttp({ baseUrl, fetch: fetchInyectado }: ApiClientOptions): Http {
  const base = baseUrl.replace(/\/+$/, '');

  // No se guarda `globalThis.fetch` suelto: separado de su objeto, el navegador
  // lo rechaza con "Illegal invocation".
  const doFetch: Fetch = fetchInyectado ?? ((input, init) => globalThis.fetch(input, init));

  return async function request<T>({
    method,
    path,
    schema,
    query,
    body,
    signal,
  }: HttpRequest<T>): Promise<T> {
    const url = base + path + construirQuery(query);
    const tieneCuerpo = body !== undefined;

    let respuesta: Response;
    try {
      respuesta = await doFetch(url, {
        method,
        // ┌────────────────────────────────────────────────────────────────┐
        // │ SIN ESTO NO HAY SESION.                                        │
        // │                                                                │
        // │ La cookie es `httpOnly` a proposito —un XSS no puede leerla—,   │
        // │ asi que este codigo tampoco: no puede adjuntarla a mano. Es el  │
        // │ navegador quien la envia, y solo si se le pide aqui.            │
        // │                                                                │
        // │ 'include' y no 'same-origin' porque en desarrollo el panel      │
        // │ (3000) y la API (3001) son origenes distintos. En produccion    │
        // │ son el mismo y las dos opciones valen; esta vale en los dos.    │
        // └────────────────────────────────────────────────────────────────┘
        credentials: 'include',
        headers: {
          accept: 'application/json',
          ...(tieneCuerpo ? { 'content-type': 'application/json' } : {}),
        },
        body: tieneCuerpo ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (causa) {
      // Cancelar no es fallar: se propaga el AbortError tal cual para que quien
      // cancelo pueda reconocerlo y no pinte un aviso de "sin conexion".
      if (esAbortada(causa)) throw causa;
      throw new NetworkError(method, url, causa);
    }

    const cuerpo = await leerCuerpo(respuesta);

    if (!respuesta.ok) throw errorDeLaApi(respuesta.status, cuerpo);

    const resultado = schema.safeParse(cuerpo);
    if (!resultado.success) throw new ApiResponseError(method, path, resultado.error);
    return resultado.data;
  };
}

function construirQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(query)) {
    // `undefined` se omite: un filtro sin valor no debe viajar como `q=undefined`,
    // que el servidor interpretaria como una busqueda de esa palabra.
    if (valor !== undefined) params.set(clave, String(valor));
  }
  const cadena = params.toString();
  return cadena ? `?${cadena}` : '';
}

/**
 * Cuerpo de la respuesta, sin suponer que sea JSON.
 *
 * Un proxy mal configurado o un 502 del hosting devuelven HTML. Si eso reventara
 * al parsear, el error que veria la interfaz seria un `SyntaxError` en lugar del
 * codigo de estado, que es el dato que de verdad explica lo que ha pasado.
 */
async function leerCuerpo(respuesta: Response): Promise<unknown> {
  const texto = await respuesta.text();
  if (texto === '') return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/** Traduce el cuerpo de error de NestJS a `ApiError`. */
function errorDeLaApi(status: number, cuerpo: unknown): ApiError {
  const objeto = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as {
    message?: unknown;
    issues?: unknown;
  };

  const mensaje =
    typeof objeto.message === 'string' && objeto.message !== ''
      ? objeto.message
      : // Ni mensaje ni cuerpo util: el estado es lo unico que sabemos, y decirlo
        // es mejor que un texto inventado que sugiera una causa que no consta.
        `La API respondio ${status}.`;

  return new ApiError(status, mensaje, issuesDe(objeto.issues));
}

function issuesDe(valor: unknown): FieldIssue[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((i) => {
    if (typeof i !== 'object' || i === null) return [];
    const { path, message } = i as { path?: unknown; message?: unknown };
    if (typeof path !== 'string' || typeof message !== 'string') return [];
    return [{ path, message }];
  });
}

function esAbortada(causa: unknown): boolean {
  return (
    typeof causa === 'object' &&
    causa !== null &&
    (causa as { name?: unknown }).name === 'AbortError'
  );
}
