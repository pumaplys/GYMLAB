import { describe, expect, it } from 'vitest';
import { createApiClient } from '../index';
import { json, servidor, SOCIO } from './ayudas';

const GYM = '22222222-2222-4222-8222-222222222222';

describe('auth', () => {
  it('cada llamada usa su ruta y su metodo', async () => {
    const { fetch, llamadas } = servidor(({ url }) =>
      url.endsWith('/auth/me')
        ? json({
            user: {
              id: '33333333-3333-4333-8333-333333333333',
              name: 'Ana',
              email: 'ana@ejemplo.test',
              emailVerified: true,
              isPlatformAdmin: false,
            },
            activeGymId: GYM,
            memberships: [{ gymId: GYM, gymName: 'Gimnasio Uno', role: 'owner' }],
          })
        : json({ token: 't', activeGymId: GYM }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.auth.login({ email: 'ana@ejemplo.test', password: 'secreta' });
    await api.auth.switchGym({ gymId: GYM });
    const yo = await api.auth.me();

    expect(llamadas.map((l) => `${l.init.method} ${l.url}`)).toEqual([
      'POST /v1/auth/login',
      'POST /v1/auth/switch-gym',
      'GET /v1/auth/me',
    ]);
    expect(yo.memberships[0]?.role).toBe('owner');
  });

  it('logout no manda la sesion en el cuerpo: la cookie ya la lleva', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(api.auth.logout()).resolves.toEqual({ ok: true });
    expect(llamadas[0]?.init.body).toBeUndefined();
  });
});

describe('socios', () => {
  it('lista con paginacion y filtros', async () => {
    const { fetch, llamadas } = servidor(() =>
      json({ items: [SOCIO], total: 1, page: 1, pageSize: 25 }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const pagina = await api.members.list(GYM, { q: 'ana', page: 1, pageSize: 25 });

    expect(llamadas[0]?.url).toBe(`/v1/gyms/${GYM}/members?q=ana&page=1&pageSize=25`);
    expect(pagina.items[0]?.memberNumber).toBe(7);
  });

  it('el alta devuelve la ficha creada', async () => {
    const { fetch, llamadas } = servidor(() => json(SOCIO, 201));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const socio = await api.members.create(GYM, { firstName: 'Ana', lastName: 'Ruiz' });

    expect(llamadas[0]?.init.method).toBe('POST');
    expect(socio.id).toBe(SOCIO.id);
  });

  it('el gimnasio de la ruta se codifica: no se pega en crudo en la URL', async () => {
    const { fetch, llamadas } = servidor(() =>
      json({ items: [], total: 0, page: 1, pageSize: 25 }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.members.list('../../auth/me', { page: 1, pageSize: 25 });

    expect(llamadas[0]?.url).toBe('/v1/gyms/..%2F..%2Fauth%2Fme/members?page=1&pageSize=25');
  });
});
