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

  it('aceptar una invitacion abre sesion; vincularla dice a que gimnasio', async () => {
    const { fetch, llamadas } = servidor(({ url }) =>
      url.endsWith('/auth/link-invitation')
        ? json({ ok: true, gymId: GYM })
        : json({ token: 't', activeGymId: GYM }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.auth.acceptInvitation({ token: 'tk', name: 'Ana', password: 'contrasena-larga' });
    const vinculada = await api.auth.linkInvitation({ token: 'tk' });

    expect(llamadas.map((l) => `${l.init.method} ${l.url}`)).toEqual([
      'POST /v1/auth/accept-invitation',
      'POST /v1/auth/link-invitation',
    ]);
    // El gimnasio del token, que es el que hara falta para ofrecer el cambio:
    // `link` no toca el gimnasio activo a proposito.
    expect(vinculada.gymId).toBe(GYM);
  });

  it('vincular no manda credenciales, porque el contrato no las tiene', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true, gymId: GYM }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.auth.linkInvitation({ token: 'tk' });

    // La garantia de ADR-0010 es estructural: al no existir el dato en el
    // contrato, este camino no puede cambiar una contrasena ni por error.
    expect(JSON.parse(String(llamadas[0]?.init.body))).toEqual({ token: 'tk' });
  });

  it('logout no manda la sesion en el cuerpo: la cookie ya la lleva', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(api.auth.logout()).resolves.toEqual({ ok: true });
    expect(llamadas[0]?.init.body).toBeUndefined();
  });
});

describe('invitaciones', () => {
  const INVITACION = {
    id: '66666666-6666-4666-8666-666666666666',
    email: 'recepcion@ejemplo.test',
    role: 'receptionist',
    expiresAt: '2026-08-11T10:00:00.000Z',
    acceptedAt: null,
    revokedAt: null,
  };

  it('listar, invitar y revocar usan su ruta y su metodo', async () => {
    const { fetch, llamadas } = servidor(({ init }) =>
      init.method === 'GET'
        ? json([INVITACION])
        : init.method === 'DELETE'
          ? json({ ok: true })
          : json(INVITACION, 201),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.invitations.list(GYM);
    await api.invitations.create(GYM, { email: 'recepcion@ejemplo.test', role: 'receptionist' });
    await api.invitations.revoke(GYM, INVITACION.id);

    const base = `/v1/gyms/${GYM}/invitations`;
    expect(llamadas.map((l) => `${l.init.method} ${l.url}`)).toEqual([
      `GET ${base}`,
      `POST ${base}`,
      `DELETE ${base}/${INVITACION.id}`,
    ]);
  });

  it('revocar no manda cuerpo: la invitacion la dice la ruta', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.invitations.revoke(GYM, INVITACION.id);

    expect(llamadas[0]?.init.body).toBeUndefined();
  });

  it('un rol que no existe en el contrato se rechaza al volver', async () => {
    // La matriz de quien invita a quien es el control de escalada de
    // privilegios. Si la API devolviera un rol que el contrato no conoce, la
    // pantalla lo pintaria sin saber que significa.
    const { fetch } = servidor(() => json([{ ...INVITACION, role: 'superadmin' }]));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(api.invitations.list(GYM)).rejects.toThrow(/role/);
  });
});

describe('personal', () => {
  const PERSONA = {
    userId: '77777777-7777-4777-8777-777777777777',
    name: 'Sonia Mostrador',
    email: 'sonia@ejemplo.test',
    role: 'receptionist',
    joinedAt: '2026-03-01T09:00:00.000Z',
  };

  it('listar y retirar usan su ruta y su metodo', async () => {
    const { fetch, llamadas } = servidor(({ init }) =>
      init.method === 'GET' ? json([PERSONA]) : json({ ok: true }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const personal = await api.staff.list(GYM);
    await api.staff.revoke(GYM, PERSONA.userId);

    const base = `/v1/gyms/${GYM}/staff`;
    expect(llamadas.map((l) => `${l.init.method} ${l.url}`)).toEqual([
      `GET ${base}`,
      `DELETE ${base}/${PERSONA.userId}`,
    ]);
    expect(personal[0]?.role).toBe('receptionist');
  });

  it('retirar no manda cuerpo: a quien se retira lo dice la ruta', async () => {
    const { fetch, llamadas } = servidor(() => json({ ok: true }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.staff.revoke(GYM, PERSONA.userId);

    expect(llamadas[0]?.init.body).toBeUndefined();
  });

  it('un campo de mas en la respuesta no llega a la pantalla', async () => {
    // El contrato expone lo justo para pintar la lista y retirar el acceso. Si
    // el servidor empezara a mandar la fila entera, Zod la recorta aqui en vez
    // de dejar que datos que nadie pidio acaben en el navegador.
    const { fetch } = servidor(() => json([{ ...PERSONA, endedByUserId: 'algo', gymId: 'otro' }]));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const personal = await api.staff.list(GYM);

    expect(Object.keys(personal[0]!).sort()).toEqual([
      'email',
      'joinedAt',
      'name',
      'role',
      'userId',
    ]);
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

  it('cada accion sobre una ficha usa su ruta y su metodo', async () => {
    const { fetch, llamadas } = servidor(({ url }) =>
      url.endsWith('/invite')
        ? json({
            id: '44444444-4444-4444-8444-444444444444',
            email: 'ana@ejemplo.test',
            role: 'member',
            expiresAt: '2026-08-11T10:00:00.000Z',
            acceptedAt: null,
            revokedAt: null,
          })
        : json(SOCIO),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.members.getById(GYM, SOCIO.id);
    await api.members.update(GYM, SOCIO.id, { phone: '600111222' });
    await api.members.deactivate(GYM, SOCIO.id);
    await api.members.reactivate(GYM, SOCIO.id);
    await api.members.invite(GYM, SOCIO.id);

    const base = `/v1/gyms/${GYM}/members/${SOCIO.id}`;
    expect(llamadas.map((l) => `${l.init.method} ${l.url}`)).toEqual([
      `GET ${base}`,
      `PATCH ${base}`,
      `POST ${base}/deactivate`,
      `POST ${base}/reactivate`,
      `POST ${base}/invite`,
    ]);
  });

  it('la edicion manda solo lo que se le pasa', async () => {
    const { fetch, llamadas } = servidor(() => json(SOCIO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.members.update(GYM, SOCIO.id, { phone: '600111222' });

    // Omitir un campo significa "no lo toques". Mandar el resto de la ficha
    // sin querer sobreescribiria con valores viejos lo que otro acabe de tocar.
    expect(JSON.parse(String(llamadas[0]?.init.body))).toEqual({ phone: '600111222' });
  });

  it('baja y alta no llevan cuerpo: la accion la dice la ruta', async () => {
    const { fetch, llamadas } = servidor(() => json({ ...SOCIO, status: 'inactive' }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const socio = await api.members.deactivate(GYM, SOCIO.id);

    expect(llamadas[0]?.init.body).toBeUndefined();
    // Devuelve la ficha ya actualizada, asi que la pantalla no tiene que
    // volver a pedirla ni suponer como quedo.
    expect(socio.status).toBe('inactive');
  });

  it('el gimnasio de la ruta se codifica: no se pega en crudo en la URL', async () => {
    const { fetch, llamadas } = servidor(() =>
      json({ items: [], total: 0, page: 1, pageSize: 25 }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.members.list('../../auth/me', { page: 1, pageSize: 25 });

    expect(llamadas[0]?.url).toBe('/v1/gyms/..%2F..%2Fauth%2Fme/members?page=1&pageSize=25');
  });

  it('la cuota se pregunta, no se deduce de la suscripcion', async () => {
    const { fetch, llamadas } = servidor(() =>
      json({
        estado: 'POR_VENCER',
        puedeAcceder: true,
        diasRestantes: 3,
        hasta: '2026-08-07',
        planName: 'Mensual',
      }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const cuota = await api.billing.dues(GYM, SOCIO.id);

    expect(llamadas[0]?.url).toBe(`/v1/gyms/${GYM}/members/${SOCIO.id}/dues`);
    // El estado no es una columna: lo calcula el servidor comparando el fin de
    // periodo con hoy EN LA ZONA DEL GIMNASIO. Deducirlo aqui daria otra cosa.
    expect(cuota.estado).toBe('POR_VENCER');
    expect(cuota.diasRestantes).toBe(3);
  });

  it('registrar un pago devuelve el estado resultante, no solo el pago', async () => {
    // Lo descubrio el panel: la API respondia {payment, dues} desde la Fase 1 y
    // el contrato no lo describia. El cliente pedia un pago suelto y la
    // validacion lo delato con todos los campos a undefined.
    //
    // Y la forma es el diseno: con una deuda de varios meses, cobrar uno NO
    // pone al corriente. El mostrador tiene que verlo en ese momento.
    const { fetch } = servidor(() =>
      json({
        payment: {
          id: '55555555-5555-4555-8555-555555555555',
          concept: 'subscription',
          amountCents: 3500,
          currency: 'EUR',
          method: 'cash',
          paidOn: '2026-08-04',
          note: null,
          recordedByUserId: null,
          voidedAt: null,
          voidReason: null,
        },
        dues: {
          estado: 'VENCIDA',
          puedeAcceder: false,
          diasRestantes: -40,
          hasta: '2026-06-25',
          planName: 'Mensual',
        },
      }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const resultado = await api.billing.registerPayment(GYM, SOCIO.id, {
      concept: 'subscription',
      amountCents: 3500,
      method: 'cash',
    });

    expect(resultado.payment.amountCents).toBe(3500);
    expect(resultado.dues.estado).toBe('VENCIDA');
  });

  it('un importe con decimales no cumple el contrato y se rechaza al volver', async () => {
    // El dinero viaja en centimos enteros. Si la API devolviera 19.99, la
    // pantalla lo pintaria tan feliz; con validacion, es un error localizado.
    const { fetch } = servidor(() =>
      json({
        payment: {
          id: '55555555-5555-4555-8555-555555555555',
          concept: 'subscription',
          amountCents: 19.99,
          currency: 'EUR',
          method: 'cash',
          paidOn: '2026-08-04',
          note: null,
          recordedByUserId: null,
          voidedAt: null,
          voidReason: null,
        },
        dues: {
          estado: 'AL_CORRIENTE',
          puedeAcceder: true,
          diasRestantes: 30,
          hasta: '2026-09-04',
          planName: 'Mensual',
        },
      }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(
      api.billing.registerPayment(GYM, SOCIO.id, {
        concept: 'subscription',
        amountCents: 1999,
        method: 'cash',
      }),
    ).rejects.toThrow(/amountCents/);
  });

  it('y el id de la ficha tambien, que viene de la URL del navegador', async () => {
    const { fetch, llamadas } = servidor(() => json(SOCIO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.members.getById(GYM, '../../../auth/me');

    // Sin codificar, ese id saldria de la ruta de socios y apuntaria a otro
    // endpoint. No abriria nada —el servidor decide igual— pero el cliente
    // estaria construyendo una URL que no es la que declara.
    expect(llamadas[0]?.url).toBe(`/v1/gyms/${GYM}/members/..%2F..%2F..%2Fauth%2Fme`);
  });
});
