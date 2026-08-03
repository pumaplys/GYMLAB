import type { ZodError } from 'zod';

/**
 * Un problema de campo, tal y como lo devuelve la API.
 *
 * `ZodBody` del servidor aplana los errores de Zod a `{ path, message }` antes
 * de responder, asi que el formulario puede colocar cada mensaje junto a su
 * campo sin volver a interpretarlos.
 */
export interface FieldIssue {
  path: string;
  message: string;
}

/**
 * Raiz de todo lo que puede lanzar este cliente.
 *
 * Existe para que la interfaz pueda distinguir "algo del cliente de la API" de
 * cualquier otra excepcion, sin tener que enumerar las tres clases de abajo.
 */
export abstract class ApiClientError extends Error {}

/**
 * La API respondio, y respondio que no.
 *
 * Es el unico error de los tres que trae un mensaje pensado para leerse: lo
 * escribe el servidor, en castellano y con el detalle que decida dar.
 */
export class ApiError extends ApiClientError {
  constructor(
    readonly status: number,
    message: string,
    /** Errores por campo de un 400 de validacion. Vacio en los demas casos. */
    readonly issues: readonly FieldIssue[] = [],
  ) {
    super(message);
    // Literal y no `new.target.name`: el minificador de produccion renombra las
    // clases, y con el el nombre que aparece en Sentry seria una letra suelta.
    this.name = 'ApiError';
  }
}

/**
 * La API respondio 2xx, pero el cuerpo NO cumple el contrato.
 *
 * Es la razon de ser de este paquete. Sin esta comprobacion, el modo de fallo
 * cuando la API renombra un campo es que la pantalla pinta `undefined` en un
 * rincon y nadie se entera; con ella, es un error inmediato y localizado que
 * dice que ruta y que campo.
 *
 * Se falla en cerrado, igual que con RLS y con el consentimiento: ante la duda,
 * no se sigue adelante con datos que no sabemos leer.
 */
export class ApiResponseError extends ApiClientError {
  constructor(
    readonly method: string,
    readonly path: string,
    /** El error de Zod completo, por si hace falta depurar. */
    readonly zodError: ZodError,
  ) {
    super(
      `La respuesta de ${method} ${path} no cumple el contrato: ` +
        zodError.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; '),
    );
    this.name = 'ApiResponseError';
  }
}

/**
 * No hubo respuesta: sin red, servidor caido, DNS, CORS mal configurado.
 *
 * Se distingue de `ApiError` porque la accion que ofrece la interfaz es otra:
 * ante un 409 se corrige el dato, ante esto se reintenta.
 */
export class NetworkError extends ApiClientError {
  constructor(
    readonly method: string,
    readonly url: string,
    cause: unknown,
  ) {
    super(`No se pudo contactar con la API (${method} ${url}).`, { cause });
    this.name = 'NetworkError';
  }
}
