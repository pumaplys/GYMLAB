import type { Request, Response } from 'express';

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
 * Primera IP de la cadena `x-forwarded-for`, o null.
 *
 * Detras de un proxy, esa cabecera trae "cliente, proxy1, proxy2". La primera
 * es la del cliente. Se usa para el registro de eventos y para el limite de
 * intentos.
 */
export function ipDe(headers: Headers): string | null {
  const cadena = headers.get('x-forwarded-for');
  return cadena?.split(',')[0]?.trim() || null;
}

/**
 * Traslada las cookies que emite Better Auth a la respuesta de Express.
 *
 * Es lo que da el transporte por cookie que ADR-0007 prometia para el panel
 * web: httpOnly, inmune al robo por XSS, y con el nombre y las banderas que
 * decide Better Auth.
 *
 * Antes se intentaba leer una cookie `gymlab_session` inventada por nosotros
 * que **nadie creaba nunca**: parecia funcionar y no podia funcionar. Ahora no
 * se replica ese detalle interno suyo — se reenvia lo que el emite.
 */
export function forwardAuthCookies(desde: Headers, hacia: Response): void {
  for (const cookie of desde.getSetCookie()) {
    hacia.append('Set-Cookie', cookie);
  }
}
