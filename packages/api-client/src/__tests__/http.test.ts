import { describe, expect, it } from 'vitest';
import { memberSchema, okResponseSchema } from '@gymlab/contracts';
import { createHttp } from '../http';
import { ApiError, ApiResponseError, NetworkError } from '../errors';
import { json, servidor, SOCIO } from './ayudas';

describe('transporte', () => {
  it('manda la cookie de sesion en todas las peticiones', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true }));
    const http = createHttp({ baseUrl: '/v1', fetch });

    await http({ method: 'GET', path: '/auth/me', schema: okResponseSchema });
    await http({ method: 'POST', path: '/auth/logout', schema: okResponseSchema, body: {} });

    // Sin esto la cookie httpOnly no viaja y todo responderia 401. Y no hay
    // alternativa: el codigo no puede leerla ni adjuntarla a mano.
    expect(llamadas.map((l) => l.init.credentials)).toEqual(['include', 'include']);
  });

  it('devuelve el cuerpo ya validado', async () => {
    const { fetch } = servidor(() => json(SOCIO));
    const http = createHttp({ baseUrl: '/v1', fetch });

    await expect(http({ method: 'GET', path: '/x', schema: memberSchema })).resolves.toEqual(SOCIO);
  });

  it('rechaza una respuesta 200 que no cumple el contrato', async () => {
    // El caso real: la API renombra o deja de enviar un campo. Sin validacion,
    // la pantalla pintaria `undefined` en un rincon y nadie se enteraria.
    const { hasAccount: _quitado, ...incompleto } = SOCIO;
    const { fetch } = servidor(() => json(incompleto));
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({ method: 'GET', path: '/socios/7', schema: memberSchema }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiResponseError);
    expect((error as ApiResponseError).message).toContain('GET /socios/7');
    expect((error as ApiResponseError).message).toContain('hasAccount');
  });

  it('traduce un error de validacion de la API con sus mensajes por campo', async () => {
    const { fetch } = servidor(() =>
      json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Datos no validos.',
          issues: [{ path: 'firstName', message: 'Obligatorio' }],
        },
        400,
      ),
    );
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({ method: 'POST', path: '/x', schema: memberSchema, body: {} }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      message: 'Datos no validos.',
      issues: [{ path: 'firstName', message: 'Obligatorio' }],
    });
  });

  it('conserva el codigo del contrato cuando la API lo da', async () => {
    // Es lo que permite distinguir "ese correo ya tiene cuenta" de cualquier
    // otro conflicto. Sin el codigo habria que mirar el texto del mensaje —que
    // se rompe al reescribir una frase— o dar por hecho que un 409 solo puede
    // significar una cosa, que se rompe con el segundo conflicto que aparezca.
    const { fetch } = servidor(() =>
      json({ statusCode: 409, code: 'ACCOUNT_EXISTS', message: 'Ya existe una cuenta.' }, 409),
    );
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({ method: 'POST', path: '/x', schema: memberSchema, body: {} }).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({ status: 409, code: 'ACCOUNT_EXISTS' });
  });

  it('sin codigo en el cuerpo, el codigo es null y no una cadena vacia', async () => {
    // `null` obliga a comprobar; '' se cuela en una comparacion descuidada.
    const { fetch } = servidor(() => json({ statusCode: 403, message: 'No puedes.' }, 403));
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({ method: 'GET', path: '/x', schema: memberSchema }).catch(
      (e: unknown) => e,
    );

    expect((error as ApiError).code).toBeNull();
  });

  it('sobrevive a un error que no viene en JSON', async () => {
    // Un 502 del proxy devuelve HTML. Reventar al parsear esconderia el codigo
    // de estado, que es el unico dato que explica lo que ha pasado.
    const { fetch } = servidor(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({ method: 'GET', path: '/x', schema: memberSchema }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });

  it('un fallo de red no se confunde con una respuesta', async () => {
    const caida = new TypeError('fetch failed');
    const { fetch } = servidor(() => {
      throw caida;
    });
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({ method: 'GET', path: '/x', schema: memberSchema }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).cause).toBe(caida);
  });

  it('cancelar no es fallar: el AbortError se propaga tal cual', async () => {
    const abortada = Object.assign(new Error('The operation was aborted.'), {
      name: 'AbortError',
    });
    const { fetch } = servidor(() => {
      throw abortada;
    });
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({ method: 'GET', path: '/x', schema: memberSchema }).catch(
      (e: unknown) => e,
    );

    // Envuelto en NetworkError, una busqueda que se reescribe mientras la
    // anterior sigue en vuelo pintaria un aviso de "sin conexion".
    expect(error).toBe(abortada);
    expect(error).not.toBeInstanceOf(NetworkError);
  });

  it('cancelar con un motivo propio tambien se propaga', async () => {
    // `abort(motivo)` hace que fetch rechace con ese motivo, que puede ser
    // cualquier cosa y no tiene por que llamarse 'AbortError'. Reconocer la
    // cancelacion por el nombre del error dejaba fuera este caso y lo anunciaba
    // como "no se pudo contactar con la API".
    const control = new AbortController();
    const motivo = new Error('la pantalla se ha desmontado');
    control.abort(motivo);

    const { fetch } = servidor(() => {
      throw control.signal.reason as Error;
    });
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({
      method: 'GET',
      path: '/x',
      schema: memberSchema,
      signal: control.signal,
    }).catch((e: unknown) => e);

    expect(error).toBe(motivo);
    expect(error).not.toBeInstanceOf(NetworkError);
  });
});

describe('construccion de la peticion', () => {
  it('respeta la base relativa y le quita la barra sobrante', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true }));
    const http = createHttp({ baseUrl: '/v1/', fetch });

    await http({ method: 'GET', path: '/auth/me', schema: okResponseSchema });

    // Relativa a proposito: en produccion el panel y la API comparten origen.
    expect(llamadas[0]?.url).toBe('/v1/auth/me');
  });

  it('omite los filtros sin valor y codifica los demas', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true }));
    const http = createHttp({ baseUrl: 'http://localhost:3001/v1', fetch });

    await http({
      method: 'GET',
      path: '/gyms/g1/members',
      schema: okResponseSchema,
      query: { q: 'ana ruiz', status: undefined, page: 2, pageSize: 25 },
    });

    // `status=undefined` viajaria como el texto "undefined" y el servidor lo
    // rechazaria con un 400 que nadie sabria explicar.
    expect(llamadas[0]?.url).toBe(
      'http://localhost:3001/v1/gyms/g1/members?q=ana+ruiz&page=2&pageSize=25',
    );
  });

  it('manda JSON cuando hay cuerpo y nada cuando no lo hay', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true }));
    const http = createHttp({ baseUrl: '/v1', fetch });

    await http({ method: 'POST', path: '/x', schema: okResponseSchema, body: { a: 1 } });
    await http({ method: 'GET', path: '/x', schema: okResponseSchema });

    const [conCuerpo, sinCuerpo] = llamadas;
    expect(conCuerpo?.init.body).toBe('{"a":1}');
    expect(cabecera(conCuerpo?.init, 'content-type')).toBe('application/json');
    expect(sinCuerpo?.init.body).toBeUndefined();
    // Sin cuerpo no se anuncia un tipo de contenido que no existe.
    expect(cabecera(sinCuerpo?.init, 'content-type')).toBeUndefined();
  });
});

function cabecera(init: RequestInit | undefined, nombre: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[nombre];
}
