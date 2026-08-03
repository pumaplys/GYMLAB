import type { Member } from '@gymlab/contracts';
import type { Fetch } from '../http';

export interface Llamada {
  url: string;
  init: RequestInit;
}

/**
 * Un servidor de mentira: responde lo que se le diga y apunta lo que recibe.
 *
 * Los tests de este paquete no necesitan ni red ni base de datos, porque lo que
 * comprueban es exactamente lo que este paquete decide: que se manda, como se
 * interpreta lo que vuelve y que pasa cuando no cuadra.
 */
export function servidor(responder: (llamada: Llamada) => Response | Promise<Response>): {
  fetch: Fetch;
  llamadas: Llamada[];
} {
  const llamadas: Llamada[] = [];
  const fetch: Fetch = async (input, init = {}) => {
    const llamada: Llamada = { url: String(input), init };
    llamadas.push(llamada);
    return responder(llamada);
  };
  return { fetch, llamadas };
}

/** Respuesta JSON, como las de la API. */
export function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Una ficha de socio valida, para partir de ella y romperla a proposito. */
export const SOCIO: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  memberNumber: 7,
  firstName: 'Ana',
  lastName: 'Ruiz',
  email: 'ana@ejemplo.test',
  phone: null,
  birthDate: null,
  status: 'active',
  joinedAt: '2026-08-03T10:00:00.000Z',
  leftAt: null,
  hasAccount: false,
};
