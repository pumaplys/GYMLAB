import { describe, expect, it, vi } from 'vitest';
import { crearFetchAutenticado } from './fetch-autenticado';

/**
 * Un espia con la FIRMA del fetch, no un `vi.fn()` pelado.
 *
 * Sin tipar los parametros, `mock.calls` es una tupla vacia y TypeScript
 * rechaza leer `calls[0][1]`: el test compilaba en vitest y fallaba en
 * `tsc --noEmit`, que es exactamente el tipo de verde enganoso que no
 * interesa.
 */
const espiarFetch = () =>
  vi.fn(async (_entrada: RequestInfo | URL, _init?: RequestInit) =>
    new Response('{}', { status: 200 }),
  );

/**
 * El fetch autenticado: tres reglas y sus tres pruebas.
 *
 * No hace falta ni SecureStore ni red: la funcion recibe el lector de token y
 * el fetch base como parametros justo para poder probarse asi.
 */
describe('fetchAutenticado', () => {
  function cabecerasDe(espia: ReturnType<typeof espiarFetch>): Headers {
    return new Headers(espia.mock.calls[0]?.[1]?.headers);
  }

  it('anade Authorization cuando hay token', async () => {
    const base = espiarFetch();
    const f = crearFetchAutenticado(async () => 'abc123', base);

    await f('https://api.example/v1/auth/me');

    expect(cabecerasDe(base).get('authorization')).toBe('Bearer abc123');
  });

  it('NO anade Authorization cuando no hay token', async () => {
    const base = espiarFetch();
    const f = crearFetchAutenticado(async () => null, base);

    await f('https://api.example/v1/auth/login');

    // Ni la cabecera vacia ni "Bearer null": simplemente no esta.
    expect(cabecerasDe(base).has('authorization')).toBe(false);
  });

  it('conserva las cabeceras que ya traia la peticion', async () => {
    const base = espiarFetch();
    const f = crearFetchAutenticado(async () => 'abc123', base);

    await f('https://api.example/v1/me/dues', {
      headers: { accept: 'application/json', 'content-type': 'application/json' },
    });

    const h = cabecerasDe(base);
    expect(h.get('accept')).toBe('application/json');
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('authorization')).toBe('Bearer abc123');
  });

  it('respeta un Authorization que venga en la peticion', async () => {
    const base = espiarFetch();
    const f = crearFetchAutenticado(async () => 'del-almacen', base);

    await f('https://api.example/v1/auth/me', { headers: { authorization: 'Bearer explicito' } });

    expect(cabecerasDe(base).get('authorization')).toBe('Bearer explicito');
  });

  it('no pierde el metodo ni el cuerpo', async () => {
    const base = espiarFetch();
    const f = crearFetchAutenticado(async () => 'abc123', base);

    await f('https://api.example/v1/auth/login', { method: 'POST', body: '{"a":1}' });

    const init = base.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"a":1}');
  });
});
