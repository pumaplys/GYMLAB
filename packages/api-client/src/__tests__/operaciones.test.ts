import { describe, expect, it } from 'vitest';
import { createApiClient } from '../index';
import { json, servidor } from './ayudas';

const GYM = '22222222-2222-4222-8222-222222222222';
const SOCIO = '11111111-1111-4111-8111-111111111111';
const PAGO = '33333333-3333-4333-8333-333333333333';

const PAGO_ANULADO = {
  id: PAGO,
  concept: 'subscription',
  amountCents: 4000,
  currency: 'EUR',
  method: 'cash',
  paidOn: '2026-08-01',
  note: null,
  recordedByUserId: null,
  voidedAt: '2026-08-18T10:00:00.000Z',
  voidReason: 'Cobrado dos veces por error',
};

const SUSCRIPCION = {
  id: '44444444-4444-4444-8444-444444444444',
  planId: '55555555-5555-4555-8555-555555555555',
  planName: 'Mensual',
  period: 'monthly',
  priceCents: 4000,
  currency: 'EUR',
  status: 'paused',
  startedOn: '2026-01-01',
  currentPeriodEnd: '2026-09-01',
  pausedAt: '2026-08-18T10:00:00.000Z',
  pausedDays: 3,
};

describe('anular un pago', () => {
  it('va a la ruta del gimnasio, no a la del socio', async () => {
    /*
     * Un pago se identifica solo. Colgarlo del socio abriria la puerta a
     * anular el pago de otro pasando el propio memberId.
     */
    const { fetch, llamadas } = servidor(() => json(PAGO_ANULADO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.billing.voidPayment(GYM, PAGO, 'Cobrado dos veces por error');

    expect(`${llamadas[0]!.init.method} ${llamadas[0]!.url}`).toBe(
      `POST /v1/gyms/${GYM}/payments/${PAGO}/void`,
    );
  });

  it('manda el motivo, que el servidor exige', async () => {
    const { fetch, llamadas } = servidor(() => json(PAGO_ANULADO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.billing.voidPayment(GYM, PAGO, 'Duplicado');

    expect(JSON.parse(String(llamadas[0]!.init.body))).toEqual({ reason: 'Duplicado' });
  });

  it('devuelve el pago con su marca de anulacion: NO desaparece', async () => {
    // La tabla es append-only. Si la respuesta no trajera la fila, la pantalla
    // no podria distinguir «anulado» de «borrado».
    const { fetch } = servidor(() => json(PAGO_ANULADO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const pago = await api.billing.voidPayment(GYM, PAGO, 'Duplicado');

    expect(pago.id).toBe(PAGO);
    expect(pago.voidedAt).not.toBeNull();
    expect(pago.voidReason).toBe('Cobrado dos veces por error');
    expect(pago.amountCents).toBe(4000);
  });

  it('un rechazo del servidor llega a quien llama', async () => {
    // «Ese pago ya esta anulado» es un 400 que la pantalla tiene que mostrar.
    const { fetch } = servidor(() => json({ message: 'Ese pago ya esta anulado.' }, 400));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(api.billing.voidPayment(GYM, PAGO, 'otra vez')).rejects.toBeTruthy();
  });
});

describe('congelar, reanudar y dar de baja la cuota', () => {
  it('cada accion usa su ruta y su metodo', async () => {
    const { fetch, llamadas } = servidor(({ init }) =>
      init.method === 'DELETE' ? json(null) : json(SUSCRIPCION),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.billing.pause(GYM, SOCIO);
    await api.billing.resume(GYM, SOCIO);
    await api.billing.cancel(GYM, SOCIO);

    expect(llamadas.map((l) => `${l.init.method} ${l.url}`)).toEqual([
      `POST /v1/gyms/${GYM}/members/${SOCIO}/subscription/pause`,
      `POST /v1/gyms/${GYM}/members/${SOCIO}/subscription/resume`,
      `DELETE /v1/gyms/${GYM}/members/${SOCIO}/subscription`,
    ]);
  });

  it('congelar devuelve la cuota con su estado nuevo', async () => {
    const { fetch } = servidor(() => json(SUSCRIPCION));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const sub = await api.billing.pause(GYM, SOCIO);

    expect(sub.status).toBe('paused');
    expect(sub.pausedAt).not.toBeNull();
  });

  it('dar de baja no devuelve nada, y no se inventa una respuesta', async () => {
    // El servidor no manda cuerpo: deja de haber cuota vigente.
    const { fetch } = servidor(() => new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(api.billing.cancel(GYM, SOCIO)).resolves.toBeUndefined();
  });

  it('los errores de transicion del servidor llegan arriba', async () => {
    /*
     * «Esa cuota ya esta congelada» o «no se puede congelar una cuota vencida»
     * los decide el servidor. La pantalla oculta las acciones que no tienen
     * sentido, pero si algo se cuela, el mensaje tiene que verse.
     */
    const { fetch } = servidor(() => json({ message: 'Esa cuota ya esta congelada.' }, 400));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(api.billing.pause(GYM, SOCIO)).rejects.toBeTruthy();
  });
});

describe('biblioteca de ejercicios', () => {
  const EJERCICIO = {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'Sentadilla',
    muscleGroup: 'legs',
    equipment: 'Barra',
    fromTemplate: false,
  };

  it('crear, editar y borrar usan su ruta', async () => {
    const { fetch, llamadas } = servidor(({ init }) =>
      init.method === 'DELETE' ? json(null) : json(EJERCICIO),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.entrenamiento.crearEjercicio(GYM, { name: 'Sentadilla', muscleGroup: 'legs' });
    await api.entrenamiento.actualizarEjercicio(GYM, EJERCICIO.id, { name: 'Sentadilla frontal' });
    await api.entrenamiento.eliminarEjercicio(GYM, EJERCICIO.id);

    expect(llamadas.map((l) => `${l.init.method} ${l.url}`)).toEqual([
      `POST /v1/gyms/${GYM}/exercises`,
      `PATCH /v1/gyms/${GYM}/exercises/${EJERCICIO.id}`,
      `DELETE /v1/gyms/${GYM}/exercises/${EJERCICIO.id}`,
    ]);
  });

  it('editar manda solo lo que cambia', async () => {
    // El contrato es `partial()`: mandar el objeto entero reescribiria campos
    // que nadie toco.
    const { fetch, llamadas } = servidor(() => json(EJERCICIO));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.entrenamiento.actualizarEjercicio(GYM, EJERCICIO.id, { equipment: 'Mancuernas' });

    expect(JSON.parse(String(llamadas[0]!.init.body))).toEqual({ equipment: 'Mancuernas' });
  });

  it('una respuesta que no cuadra con el contrato no pasa en silencio', async () => {
    const { fetch } = servidor(() => json({ ...EJERCICIO, muscleGroup: 'inventado' }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(
      api.entrenamiento.crearEjercicio(GYM, { name: 'X', muscleGroup: 'legs' }),
    ).rejects.toBeTruthy();
  });
});

describe('exportacion de datos personales', () => {
  it('pide el export del socio', async () => {
    const { fetch, llamadas } = servidor(() => json({ exportadoEl: '2026-08-18T10:00:00.000Z' }));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await api.members.exportData(GYM, SOCIO);

    expect(`${llamadas[0]!.init.method} ${llamadas[0]!.url}`).toBe(
      `GET /v1/gyms/${GYM}/members/${SOCIO}/export`,
    );
  });

  it('NO recorta secciones que no conozca', async () => {
    /*
     * La respuesta la componen los modulos registrados. Un esquema cerrado
     * dejaria fuera al siguiente que se anada, y en una entrega legal eso es
     * justo lo que no puede pasar.
     */
    const { fetch } = servidor(() =>
      json({
        exportadoEl: '2026-08-18T10:00:00.000Z',
        ficha: { id: SOCIO },
        progresoYConsentimientos: { mediciones: [] },
        moduloQueTodaviaNoExiste: { algo: true },
      }),
    );
    const api = createApiClient({ baseUrl: '/v1', fetch });

    const datos = (await api.members.exportData(GYM, SOCIO)) as Record<string, unknown>;

    expect(datos.moduloQueTodaviaNoExiste).toEqual({ algo: true });
    expect(datos.progresoYConsentimientos).toBeDefined();
  });

  it('un 403 llega a quien llama: recepcion no exporta', async () => {
    const { fetch } = servidor(() => json({ message: 'Prohibido' }, 403));
    const api = createApiClient({ baseUrl: '/v1', fetch });

    await expect(api.members.exportData(GYM, SOCIO)).rejects.toBeTruthy();
  });
});
