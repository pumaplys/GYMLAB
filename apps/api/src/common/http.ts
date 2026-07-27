import type { Request } from 'express';

/** Convierte las cabeceras de Express al `Headers` estandar que espera Better Auth. */
export function toHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [clave, valor] of Object.entries(request.headers)) {
    if (typeof valor === 'string') headers.set(clave, valor);
    else if (Array.isArray(valor)) headers.set(clave, valor.join(', '));
  }
  return headers;
}

/**
 * Extrae el token de sesion de la peticion.
 *
 * Dos transportes a proposito (ADR-0007): el panel web usa cookie httpOnly, que
 * es inmune a robo por XSS; la app movil no tiene cookies y manda `Bearer`.
 */
export function extractSessionToken(request: Request): string {
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  const cookie = request.headers.cookie ?? '';
  const match = /(?:^|;\s*)gymlab_session=([^;]+)/.exec(cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}
