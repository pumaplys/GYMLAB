import { describe, expect, it } from 'vitest';
import { ApiResponseError } from '../errors';
import { createApiClient } from '../index';
import { json, servidor } from './ayudas';

const GYM = '22222222-2222-4222-8222-222222222222';
const SOCIO_ID = '11111111-1111-4111-8111-111111111111';

const RESULTADO = {
  decision: 'ALLOW',
  reason: 'OK',
  member: { id: SOCIO_ID, memberNumber: 7, firstName: 'Ana', lastName: 'Socia' },
  diasRestantes: 12,
  isRetry: false,
};

describe('accesos: verificar un carne', () => {
  it('usa la ruta y el metodo del endpoint real', async () => {
    const { fetch, llamadas } = servidor(() => json(RESULTADO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.accesos.verify(GYM, 'un-token');

    expect(llamadas).toHaveLength(1);
    expect(`${llamadas[0]!.init.method} ${llamadas[0]!.url}`).toBe(
      `POST /v1/gyms/${GYM}/access/verify`,
    );
  });

  it('manda el token en el cuerpo, nunca en la URL', async () => {
    /*
     * El token es una credencial de un solo uso. En la ruta acabaria en los
     * registros del proxy y en el historial del navegador; en el cuerpo, no.
     */
    const { fetch, llamadas } = servidor(() => json(RESULTADO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.accesos.verify(GYM, 'token-secreto');

    expect(llamadas[0]!.url).not.toContain('token-secreto');
    expect(JSON.parse(String(llamadas[0]!.init.body))).toEqual({ token: 'token-secreto' });
  });

  it('devuelve la decision entera, con socio y dias', async () => {
    const { fetch } = servidor(() => json(RESULTADO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const resultado = await api.accesos.verify(GYM, 't');

    expect(resultado.decision).toBe('ALLOW');
    expect(resultado.member?.memberNumber).toBe(7);
    expect(resultado.diasRestantes).toBe(12);
    expect(resultado.isRetry).toBe(false);
  });

  it('acepta un DENY sin socio: es lo normal con una firma invalida', async () => {
    const { fetch } = servidor(() =>
      json({
        decision: 'DENY',
        reason: 'BAD_SIGNATURE',
        member: null,
        diasRestantes: null,
        isRetry: false,
      }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const resultado = await api.accesos.verify(GYM, 'basura');

    expect(resultado.decision).toBe('DENY');
    expect(resultado.member).toBeNull();
  });

  it('un decision o reason que el contrato no conoce NO pasa en silencio', async () => {
    /*
     * Si el servidor cambiara el contrato, esto tiene que romperse aqui y no
     * tres capas mas arriba pintando una decision que nadie sabe interpretar.
     */
    const { fetch } = servidor(() => json({ ...RESULTADO, decision: 'QUIZAS' }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(api.accesos.verify(GYM, 't')).rejects.toBeInstanceOf(ApiResponseError);
  });
});

describe('accesos: historial', () => {
  const LISTA = {
    items: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        memberId: SOCIO_ID,
        memberName: 'Ana Socia',
        decision: 'ALLOW',
        reason: 'OK',
        isRetry: false,
        occurredAt: '2026-08-18T10:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
  };

  it('pide el listado del gimnasio con su paginacion', async () => {
    const { fetch, llamadas } = servidor(() => json(LISTA));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const lista = await api.accesos.events(GYM, { pageSize: 25 });

    expect(llamadas[0]!.init.method).toBe('GET');
    expect(llamadas[0]!.url).toContain(`/gyms/${GYM}/access/events`);
    expect(llamadas[0]!.url).toContain('pageSize=25');
    expect(lista.items[0]?.memberName).toBe('Ana Socia');
  });

  it('sin parametros no ensucia la URL con valores vacios', async () => {
    // `memberId` y `page` sin valor no deben viajar como `memberId=undefined`.
    const { fetch, llamadas } = servidor(() => json(LISTA));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.accesos.events(GYM);

    expect(llamadas[0]!.url).not.toContain('undefined');
  });

  it('admite un evento SIN socio, que es como se registran los intentos tecnicos', async () => {
    const { fetch } = servidor(() =>
      json({
        ...LISTA,
        items: [{ ...LISTA.items[0], memberId: null, memberName: null, reason: 'TOKEN_EXPIRED' }],
      }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const lista = await api.accesos.events(GYM);

    expect(lista.items[0]?.memberName).toBeNull();
    expect(lista.items[0]?.reason).toBe('TOKEN_EXPIRED');
  });
});
