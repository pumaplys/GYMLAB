import type { Request, Response } from 'express';

/**
 * Donde `toHeaders` deja la IP ya resuelta para que la lea `ipDe`.
 *
 * Lleva prefijo propio y **se sobreescribe siempre**, asi que da igual que
 * alguien la mande desde fuera: el valor que llega no sobrevive.
 */
const CABECERA_IP = 'x-gymlab-client-ip';

/**
 * Convierte las cabeceras de Express al `Headers` estandar que espera Better
 * Auth, y **anade la IP de confianza**.
 *
 * El orden importa: primero se copia lo que vino y despues se fija la IP, de
 * modo que `set` machaque cualquier intento de colar `x-gymlab-client-ip`
 * desde fuera.
 */
export function toHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [clave, valor] of Object.entries(request.headers)) {
    if (typeof valor === 'string') headers.set(clave, valor);
    else if (Array.isArray(valor)) headers.set(clave, valor.join(', '));
  }
  // `request.ip` es lo que Express deduce SEGUN `trust proxy`: sin proxy, la
  // del socket; con N saltos de confianza, la que escribio el ultimo proxy
  // fiable. Ese calculo no se reimplementa aqui — ver `TRUST_PROXY` en env.ts.
  if (request.ip) headers.set(CABECERA_IP, request.ip);
  else headers.delete(CABECERA_IP);
  return headers;
}

/**
 * La IP del cliente, o null.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ YA NO LEE `x-forwarded-for`, Y ESE ES EL ARREGLO.                        │
 * │                                                                          │
 * │ Antes cogia el PRIMER valor de esa cabecera, que es justamente el que    │
 * │ escribe quien llama: un proxy no la reemplaza, le anade el suyo por la   │
 * │ derecha. Rotandola en cada peticion, el limite de intentos no llegaba a  │
 * │ dispararse nunca — comprobado contra este proceso, 12 de 12 pasaron.     │
 * │                                                                          │
 * │ Ahora lee lo que dejo `toHeaders`, que viene de `request.ip` y por tanto │
 * │ respeta `TRUST_PROXY`. Una cabecera inventada deja de valer.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se usa para el registro de eventos y para el limite de intentos.
 */
export function ipDe(headers: Headers): string | null {
  return headers.get(CABECERA_IP)?.trim() || null;
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
