/**
 * TESTS FUNCIONALES DE PLANES, CUOTAS Y PAGOS
 *
 * El foco es el invariante que ordena el modulo:
 *
 *   current_period_end = started_on + (pagos de cuota x periodo) + dias congelados
 *
 * De el sale la regla que se acordo para el MVP: **cada pago cubre exactamente
 * un periodo**, encadenado desde el vencimiento anterior, sin mirar la
 * antiguedad de la deuda. La consecuencia buscada es que quien lleva meses sin
 * pagar NO se pone al corriente con un pago: el camino de vuelta es cancelar y
 * dar de alta de nuevo, que es una decision de recepcion.
 *
 * Requiere:
 *   docker compose up -d
 *   pnpm db:migrate
 */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { closeDatabase, createDatabase, EMAIL_QUEUES, sql, type Database } from '@gymlab/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { env } from '../config/env';

let app: INestApplication;
let owner: Database;
let http: () => request.Agent;

const sufijo = randomUUID().slice(0, 8);
const email = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const inicio = new Date();
const gimnasiosCreados: string[] = [];

let gymA: string;
let tokenOwnerA: string;
let tokenRecepcionA: string;
/** Existe solo para comprobar quien NO llega al catalogo de planes. */
let tokenEntrenadorA: string;
let gymB: string;
let tokenOwnerB: string;
/** Plan mensual del gimnasio A, creado una vez para toda la bateria. */
let planMensual: string;

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Hoy en la zona del gimnasio, tal y como lo calcula el servidor. */
async function hoyDelGimnasio(gymId: string): Promise<string> {
  const res = await owner.execute<{ hoy: string }>(
    sql`SELECT (now() AT TIME ZONE timezone)::date AS hoy FROM gyms WHERE id = ${gymId}::uuid`,
  );
  return String(res.rows[0]!.hoy);
}

/** Fecha desplazada N dias, resuelta por PostgreSQL para no discrepar con el. */
async function masDias(fecha: string, dias: number): Promise<string> {
  const res = await owner.execute<{ d: string }>(
    sql`SELECT (${fecha}::date + ${dias}::int)::date AS d`,
  );
  return String(res.rows[0]!.d);
}

/**
 * Fecha mas N meses, TAMBIEN resuelta por PostgreSQL.
 *
 * Reimplementarlo en JavaScript seria repetir aqui la trampa que el servicio
 * evita: sumar un mes a un 31 de enero da el 28 de febrero en Postgres y el 3 de
 * marzo con aritmetica de dias. Un test que calcula distinto que el codigo no
 * comprueba el codigo, comprueba su propia copia.
 */
async function masMeses(fecha: string, meses: number): Promise<string> {
  const res = await owner.execute<{ d: string }>(
    sql`SELECT (${fecha}::date + (${meses}::int * INTERVAL '1 month'))::date AS d`,
  );
  return String(res.rows[0]!.d);
}

async function registrarGimnasio(nombre: string, quien: string) {
  const res = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: nombre,
      gymName: nombre,
      ownerName: nombre,
      email: email(quien),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  gimnasiosCreados.push(res.body.activeGymId);
  return { token: res.body.token as string, gymId: res.body.activeGymId as string };
}

async function altaPersonal(gymId: string, tokenStaff: string, rol: string, quien: string) {
  await http()
    .post(`/v1/gyms/${gymId}/invitations`)
    .set(conSesion(tokenStaff))
    .send({ email: email(quien), role: rol })
    .expect(201);

  const job = await owner.execute<{ data: { token: string } }>(
    sql`SELECT data FROM pgboss.job WHERE name = ${EMAIL_QUEUES.invitation}
        AND data->>'to' = ${email(quien)} ORDER BY created_on DESC LIMIT 1`,
  );
  const res = await http()
    .post('/v1/auth/accept-invitation')
    .send({ token: job.rows[0]!.data.token, name: quien, password: PASSWORD })
    .expect(201);
  return res.body.token as string;
}

async function altaSocio(gymId: string, tokenStaff: string, apellido: string): Promise<string> {
  const res = await http()
    .post(`/v1/gyms/${gymId}/members`)
    .set(conSesion(tokenStaff))
    .send({ firstName: 'Socio', lastName: apellido })
    .expect(201);
  return res.body.id as string;
}

/** Alta de socio + cuota, que es la pareja habitual en el mostrador. */
async function socioConCuota(apellido: string, startedOn?: string) {
  const memberId = await altaSocio(gymA, tokenOwnerA, apellido);
  const res = await http()
    .post(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
    .set(conSesion(tokenOwnerA))
    .send({ planId: planMensual, ...(startedOn ? { startedOn } : {}) })
    .expect(201);
  return { memberId, sub: res.body };
}

function pagarCuota(memberId: string, extra: Record<string, unknown> = {}) {
  return http()
    .post(`/v1/gyms/${gymA}/members/${memberId}/payments`)
    .set(conSesion(tokenOwnerA))
    .send({ concept: 'subscription', amountCents: 3000, method: 'cash', ...extra });
}

function dues(memberId: string, token = tokenOwnerA) {
  return http().get(`/v1/gyms/${gymA}/members/${memberId}/dues`).set(conSesion(token));
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 3 });

  const a = await registrarGimnasio('Gym A', 'owner-a');
  tokenOwnerA = a.token;
  gymA = a.gymId;
  const b = await registrarGimnasio('Gym B', 'owner-b');
  tokenOwnerB = b.token;
  gymB = b.gymId;

  tokenRecepcionA = await altaPersonal(gymA, tokenOwnerA, 'receptionist', 'recepcion-a');
  tokenEntrenadorA = await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-a');

  const plan = await http()
    .post(`/v1/gyms/${gymA}/plans`)
    .set(conSesion(tokenOwnerA))
    .send({ name: 'Mensual', priceCents: 3000, period: 'monthly' })
    .expect(201);
  planMensual = plan.body.id;
});

afterAll(async () => {
  await app?.close();
  if (!owner) return;
  const patron = `%-${sufijo}@test.local`;
  const ids = sql.raw(gimnasiosCreados.map((g) => `'${g}'::uuid`).join(','));

  if (gimnasiosCreados.length > 0) {
    const orgs = await owner.execute<{ organization_id: string }>(
      sql`SELECT DISTINCT organization_id FROM gyms WHERE id IN (${ids})`,
    );
    for (const t of [
      'payments',
      'member_subscriptions',
      'plans',
      'trainer_assignments',
      'trainers',
      'member_notes',
      'members',
      'member_counters',
      'invitations',
      'audit_log',
      'memberships',
    ]) {
      await owner.execute(sql`DELETE FROM ${sql.raw(t)} WHERE gym_id IN (${ids})`);
    }
    await owner.execute(sql`DELETE FROM gyms WHERE id IN (${ids})`);
    if (orgs.rows.length > 0) {
      const orgIds = sql.raw(orgs.rows.map((o) => `'${o.organization_id}'::uuid`).join(','));
      await owner.execute(sql`DELETE FROM organizations WHERE id IN (${orgIds})`);
    }
  }
  await owner.execute(
    sql`DELETE FROM auth_events WHERE email_attempted LIKE ${patron} OR created_at >= ${inicio}`,
  );
  await owner.execute(sql`DELETE FROM users WHERE email LIKE ${patron}`);
  await owner.execute(sql`DELETE FROM pgboss.job WHERE data->>'to' LIKE ${patron}`);
  await owner.execute(sql`DELETE FROM auth_throttle WHERE key LIKE ${'login:%' + sufijo + '%'}`);
  await closeDatabase(owner);
});

describe('planes', () => {
  it('el precio viaja en centimos enteros y se rechaza un decimal', async () => {
    // 29,99 € es 2999. Aceptar 29.99 abriria la puerta a que el importe llegue
    // como float y vuelva convertido en 29.989999999999998.
    await http()
      .post(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Con decimales', priceCents: 29.99, period: 'monthly' })
      .expect(400);
  });

  it('recepcion no puede crear ni cambiar planes', async () => {
    // Cobra y da de alta cuotas, pero no fija precios: eso es del negocio.
    await http()
      .post(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenRecepcionA))
      .send({ name: 'De recepcion', priceCents: 1000, period: 'monthly' })
      .expect(403);

    await http()
      .patch(`/v1/gyms/${gymA}/plans/${planMensual}`)
      .set(conSesion(tokenRecepcionA))
      .send({ priceCents: 1 })
      .expect(403);

    await http()
      .post(`/v1/gyms/${gymA}/plans/${planMensual}/archive`)
      .set(conSesion(tokenRecepcionA))
      .expect(403);
  });

  it('pero SI puede leerlos, porque los necesita para dar de alta una cuota', async () => {
    // Lo descubrio el panel: recepcion podia contratar —`POST subscription` la
    // admite— y no podia ver el catalogo del que sale el `planId`. Podia
    // ejecutar la accion y no elegir el plan.
    //
    // La separacion no es "los planes son del dueno", sino "los PRECIOS los
    // decide el dueno". Consultarlos para cobrar es trabajo de mostrador.
    const res = await http()
      .get(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenRecepcionA))
      .expect(200);

    expect(res.body.some((p: { id: string }) => p.id === planMensual)).toBe(true);
  });

  it('el entrenador NO ve el catalogo: los importes son dato economico', async () => {
    await http().get(`/v1/gyms/${gymA}/plans`).set(conSesion(tokenEntrenadorA)).expect(403);
  });

  it('el catalogo dice cuantas cuotas dependen de cada plan', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ ESTE NUMERO VALIA 0 SIEMPRE, Y NADA LO DELATABA.                     │
    // │                                                                      │
    // │ La subconsulta interpolaba la columna con `${plans.id}`, y Drizzle   │
    // │ la rinde SIN CUALIFICAR: `"id"` a secas. Dentro de la subconsulta    │
    // │ eso resuelve a `member_subscriptions`, no a `plans`, asi que la      │
    // │ condicion quedaba `s.plan_id = s.id` — un identificador comparado    │
    // │ consigo mismo, que nunca es cierto.                                  │
    // │                                                                      │
    // │ Lo destapo la pantalla de planes: la confirmacion antes de archivar  │
    // │ avisa de cuantas cuotas usan el plan, y nunca podia avisar de nada.  │
    // └──────────────────────────────────────────────────────────────────────┘
    const socio = await http()
      .post(`/v1/gyms/${gymA}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ firstName: 'Cuenta', lastName: 'Planes' })
      .expect(201);

    const plan = await http()
      .post(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenOwnerA))
      .send({ name: `Contador ${sufijo}`, priceCents: 1500, period: 'monthly' })
      .expect(201);

    // Recien creado no lo usa nadie.
    const antes = await http().get(`/v1/gyms/${gymA}/plans`).set(conSesion(tokenOwnerA)).expect(200);
    expect(antes.body.find((p: { id: string }) => p.id === plan.body.id).activeSubscriptions).toBe(
      0,
    );

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.body.id}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: plan.body.id })
      .expect(201);

    const despues = await http()
      .get(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(
      despues.body.find((p: { id: string }) => p.id === plan.body.id).activeSubscriptions,
    ).toBe(1);
  });

  it('un plan archivado no se puede contratar, y las cuotas vivas no cambian', async () => {
    const plan = await http()
      .post(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Temporal', priceCents: 5000, period: 'monthly' })
      .expect(201);

    const memberId = await altaSocio(gymA, tokenOwnerA, 'ConTemporal');
    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: plan.body.id })
      .expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/plans/${plan.body.id}/archive`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    // La cuota viva sigue en pie con su copia del precio.
    const sub = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(sub.body.priceCents).toBe(5000);

    // Pero ya no se puede contratar.
    const otro = await altaSocio(gymA, tokenOwnerA, 'Tarde');
    await http()
      .post(`/v1/gyms/${gymA}/members/${otro}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: plan.body.id })
      .expect(400);
  });

  it('subir el precio del plan NO cambia lo que paga quien ya estaba', async () => {
    // Sin la copia del precio en la suscripcion, subir la mensualidad
    // reescribiria el historial de lo que cada socio estaba pagando.
    const plan = await http()
      .post(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Sube', priceCents: 3000, period: 'monthly' })
      .expect(201);

    const memberId = await altaSocio(gymA, tokenOwnerA, 'PrecioViejo');
    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: plan.body.id })
      .expect(201);

    await http()
      .patch(`/v1/gyms/${gymA}/plans/${plan.body.id}`)
      .set(conSesion(tokenOwnerA))
      .send({ priceCents: 3500 })
      .expect(200);

    const sub = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(sub.body.priceCents).toBe(3000);
  });
});

describe('el invariante: cada pago cubre exactamente un periodo', () => {
  it('el alta NACE vencida: sin pago no hay periodo', async () => {
    // Conceder un periodo en el alta seria regalar un mes a quien no ha pagado,
    // y romperia el invariante de que cada periodo lo concede un pago.
    const { memberId, sub } = await socioConCuota('Reciente');

    expect(sub.currentPeriodEnd).toBe(sub.startedOn);

    const estado = await dues(memberId).expect(200);
    expect(estado.body.estado).toBe('POR_VENCER');
    expect(estado.body.diasRestantes).toBe(0);
    expect(estado.body.puedeAcceder).toBe(true);
  });

  it('un pago suma un periodo; dos pagos suman dos', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('DosPagos', hoy);

    await pagarCuota(memberId).expect(201);
    let sub = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(sub.body.currentPeriodEnd).toBe(await masMeses(hoy, 1));

    await pagarCuota(memberId).expect(201);
    sub = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(sub.body.currentPeriodEnd).toBe(await masMeses(hoy, 2));
  });

  it('la matricula NO extiende el periodo', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('ConMatricula', hoy);

    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/payments`)
      .set(conSesion(tokenOwnerA))
      .send({ concept: 'enrolment', amountCents: 5000, method: 'card' })
      .expect(201);

    const sub = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(sub.body.currentPeriodEnd).toBe(hoy);
  });

  it('pagar una deuda vieja NO pone al corriente, y la respuesta lo dice', async () => {
    // ESTE ES EL TEST DE LA REGLA ACORDADA.
    //
    // Se descarto que el sistema reiniciara solo el periodo "desde hoy" segun lo
    // vieja que fuera la deuda: una regla unica y predecible vale mas que una
    // que cambia de criterio sin que nadie lo pida. La contrapartida es esta, y
    // por eso el pago devuelve el estado resultante — para que el mostrador lo
    // vea en el momento en lugar de descubrirlo en la puerta.
    const hoy = await hoyDelGimnasio(gymA);
    const haceMeses = await masDias(hoy, -120);
    const { memberId } = await socioConCuota('DeudaVieja', haceMeses);

    const res = await pagarCuota(memberId).expect(201);

    expect(res.body.dues.estado).toBe('VENCIDA');
    expect(res.body.dues.puedeAcceder).toBe(false);
    expect(res.body.dues.diasRestantes).toBeLessThan(0);
  });

  it('el camino de vuelta es cancelar y dar de alta de nuevo', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('Vuelve', await masDias(hoy, -120));

    // Con una cuota vigente no se puede dar de alta otra.
    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: planMensual })
      .expect(400);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: planMensual })
      .expect(201);

    const res = await pagarCuota(memberId).expect(201);
    expect(res.body.dues.estado).toBe('AL_CORRIENTE');
    expect(res.body.dues.puedeAcceder).toBe(true);
  });
});

describe('estado de cuota: lo que consumira el QR', () => {
  it('AL_CORRIENTE con margen, POR_VENCER cerca del final', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('Semaforo', hoy);
    await pagarCuota(memberId).expect(201);

    const conMargen = await dues(memberId).expect(200);
    expect(conMargen.body.estado).toBe('AL_CORRIENTE');
    expect(conMargen.body.puedeAcceder).toBe(true);

    // Se acerca el vencimiento: se mueve la fecha, no el reloj.
    await owner.execute(
      sql`UPDATE member_subscriptions SET current_period_end = ${await masDias(hoy, 3)}::date
          WHERE member_id = ${memberId}::uuid`,
    );

    const cerca = await dues(memberId).expect(200);
    expect(cerca.body.estado).toBe('POR_VENCER');
    expect(cerca.body.diasRestantes).toBe(3);
    expect(cerca.body.puedeAcceder).toBe(true);
  });

  it('sin dias de cortesia, vencida es vencida al dia siguiente', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('SinGracia', hoy);
    await owner.execute(
      sql`UPDATE member_subscriptions SET current_period_end = ${await masDias(hoy, -1)}::date
          WHERE member_id = ${memberId}::uuid`,
    );

    const estado = await dues(memberId).expect(200);
    expect(estado.body.estado).toBe('VENCIDA');
    expect(estado.body.puedeAcceder).toBe(false);
  });

  it('con dias de cortesia, la misma cuota queda EN_GRACIA y deja pasar', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('ConGracia', hoy);
    await owner.execute(
      sql`UPDATE member_subscriptions SET current_period_end = ${await masDias(hoy, -3)}::date
          WHERE member_id = ${memberId}::uuid`,
    );

    await owner.execute(sql`UPDATE gyms SET grace_days = 5 WHERE id = ${gymA}::uuid`);
    const enGracia = await dues(memberId).expect(200);
    expect(enGracia.body.estado).toBe('EN_GRACIA');
    expect(enGracia.body.puedeAcceder).toBe(true);

    // Pasada la cortesia, deniega.
    await owner.execute(sql`UPDATE gyms SET grace_days = 2 WHERE id = ${gymA}::uuid`);
    const fuera = await dues(memberId).expect(200);
    expect(fuera.body.estado).toBe('VENCIDA');
    expect(fuera.body.puedeAcceder).toBe(false);

    await owner.execute(sql`UPDATE gyms SET grace_days = 0 WHERE id = ${gymA}::uuid`);
  });

  it('un socio sin cuota da SIN_SUSCRIPCION, no un error', async () => {
    const memberId = await altaSocio(gymA, tokenOwnerA, 'SinCuota');

    const estado = await dues(memberId).expect(200);
    expect(estado.body.estado).toBe('SIN_SUSCRIPCION');
    expect(estado.body.puedeAcceder).toBe(false);
    expect(estado.body.diasRestantes).toBeNull();
  });

  it('el estado NO mira si el socio esta de baja: son avisos distintos', async () => {
    // Mezclarlos aqui haria imposible distinguir "no paga" de "ya no es socio"
    // en el mostrador. Quien decida el acceso comprueba las dos cosas.
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('BajaConCuota', hoy);
    await pagarCuota(memberId).expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    const estado = await dues(memberId).expect(200);
    expect(estado.body.estado).toBe('AL_CORRIENTE');
  });
});

describe('congelar la cuota', () => {
  it('devuelve los dias congelados al reanudar', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('Congela', hoy);
    await pagarCuota(memberId).expect(201);

    const antes = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription/pause`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    const pausada = await dues(memberId).expect(200);
    expect(pausada.body.estado).toBe('PAUSADA');
    expect(pausada.body.puedeAcceder).toBe(false);

    // Diez dias de vacaciones: se mueve la fecha de congelacion al pasado.
    await owner.execute(
      sql`UPDATE member_subscriptions SET paused_at = ${await masDias(hoy, -10)}::date
          WHERE member_id = ${memberId}::uuid`,
    );

    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription/resume`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    const despues = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(despues.body.pausedDays).toBe(10);
    expect(despues.body.currentPeriodEnd).toBe(await masDias(antes.body.currentPeriodEnd, 10));
    expect(despues.body.status).toBe('active');
  });

  it('no se puede congelar una cuota ya vencida', async () => {
    // No quedan dias que guardar, y congelarla solo produciria un vencimiento
    // futuro absurdo a partir de una deuda.
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('VencidaCongela', await masDias(hoy, -30));

    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription/pause`)
      .set(conSesion(tokenOwnerA))
      .expect(400);
  });

  it('no se puede pagar una cuota congelada sin reanudarla', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('PagaCongelada', hoy);
    await pagarCuota(memberId).expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription/pause`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    await pagarCuota(memberId).expect(400);
  });
});

describe('pagos: append-only', () => {
  it('anular retira el periodo que concedio', async () => {
    // Si no lo retirara, el socio conservaria un mes que nadie pago y el
    // invariante dejaria de cumplirse.
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('Anula', hoy);
    const pago = await pagarCuota(memberId).expect(201);

    const conPago = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(conPago.body.currentPeriodEnd).toBe(await masMeses(hoy, 1));

    await http()
      .post(`/v1/gyms/${gymA}/payments/${pago.body.payment.id}/void`)
      .set(conSesion(tokenOwnerA))
      .send({ reason: 'Cobro apuntado dos veces' })
      .expect(201);

    const tras = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(tras.body.currentPeriodEnd).toBe(hoy);
  });

  it('el pago anulado sigue en el historial, con su motivo', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('Historial', hoy);
    const pago = await pagarCuota(memberId).expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/payments/${pago.body.payment.id}/void`)
      .set(conSesion(tokenOwnerA))
      .send({ reason: 'Error del mostrador' })
      .expect(201);

    const lista = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/payments`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].voidedAt).not.toBeNull();
    expect(lista.body[0].voidReason).toBe('Error del mostrador');
  });

  it('no se puede anular dos veces, ni anular sin motivo', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('DobleAnula', hoy);
    const pago = await pagarCuota(memberId).expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/payments/${pago.body.payment.id}/void`)
      .set(conSesion(tokenOwnerA))
      .send({ reason: '' })
      .expect(400);

    await http()
      .post(`/v1/gyms/${gymA}/payments/${pago.body.payment.id}/void`)
      .set(conSesion(tokenOwnerA))
      .send({ reason: 'Primera vez' })
      .expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/payments/${pago.body.payment.id}/void`)
      .set(conSesion(tokenOwnerA))
      .send({ reason: 'Segunda vez' })
      .expect(400);
  });

  it('recepcion registra pagos pero NO puede anularlos', async () => {
    // Si pudiera anular sus propios registros, el caracter append-only de la
    // tabla no significaria nada.
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('Recepcion', hoy);

    const pago = await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/payments`)
      .set(conSesion(tokenRecepcionA))
      .send({ concept: 'subscription', amountCents: 3000, method: 'cash' })
      .expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/payments/${pago.body.payment.id}/void`)
      .set(conSesion(tokenRecepcionA))
      .send({ reason: 'Me equivoque' })
      .expect(403);
  });

  it('la base de datos no permite BORRAR un pago, ni con el rol de la aplicacion', async () => {
    // El caracter append-only no se deja al codigo: se retira el permiso.
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('NoBorrable', hoy);
    const pago = await pagarCuota(memberId).expect(201);

    const appDb = createDatabase({ connectionString: process.env.DATABASE_URL_APP!, max: 1 });
    try {
      let motivo = 'NO FALLO';
      try {
        await appDb.execute(sql`DELETE FROM payments WHERE id = ${pago.body.payment.id}::uuid`);
      } catch (e) {
        // Drizzle envuelve el error en "Failed query: ...", asi que el motivo
        // real esta en `cause`. Comprobarlo importa: sin contexto de tenant, RLS
        // haria que el DELETE afectara a cero filas SIN error, y el test pasaria
        // creyendo que lo frena el permiso cuando no seria asi.
        motivo = String((e as { cause?: unknown }).cause ?? e);
      }
      expect(motivo).toMatch(/permission denied/i);

      // Y la fila sigue ahi.
      const sigue = await owner.execute(
        sql`SELECT id FROM payments WHERE id = ${pago.body.payment.id}::uuid`,
      );
      expect(sigue.rows).toHaveLength(1);
    } finally {
      await closeDatabase(appDb);
    }
  });
});

describe('el socio y su propia cuota', () => {
  it('ve la suya por /me/dues y no puede pedir la de otro', async () => {
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-cuota');
    const yo = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('socio-cuota')}`,
    );
    const memberId = await altaSocio(gymA, tokenOwnerA, 'Propio');
    await owner.execute(
      sql`UPDATE members SET user_id = ${yo.rows[0]!.id}::uuid WHERE id = ${memberId}::uuid`,
    );
    await http()
      .post(`/v1/gyms/${gymA}/members/${memberId}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: planMensual })
      .expect(201);
    await pagarCuota(memberId).expect(201);

    const mia = await http().get('/v1/me/dues').set(conSesion(tokenSocio)).expect(200);
    expect(mia.body.estado).toBe('AL_CORRIENTE');

    // No hay ruta con la que pedir la de otro: los endpoints con :memberId son
    // del personal.
    const ajeno = await altaSocio(gymA, tokenOwnerA, 'Ajeno');
    await dues(ajeno, tokenSocio).expect(403);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LA MISMA PERSONA, DOS GIMNASIOS, DOS CUOTAS DISTINTAS.                  │
   * │                                                                          │
   * │ `/me/dues` no lleva ningun identificador: resuelve por el `user_id` de   │
   * │ la sesion Y por el gimnasio activo. Si se olvidara el segundo, la misma  │
   * │ cuenta veria la cuota del gimnasio equivocado — y creeria estar al       │
   * │ corriente donde no lo esta.                                              │
   * │                                                                          │
   * │ Es el caso que el portal del socio hace real: cambiar de gimnasio en el  │
   * │ selector tiene que cambiar la cuota, no solo el nombre de la cabecera.   │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('socia en dos gimnasios ve la cuota de CADA uno, no la mezcla', async () => {
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socia-dos-gyms');
    const cuenta = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('socia-dos-gyms')}`,
    );
    const idCuenta = cuenta.rows[0]!.id;

    // En A: con cuota pagada.
    const enA = await altaSocio(gymA, tokenOwnerA, 'EnA');
    await owner.execute(
      sql`UPDATE members SET user_id = ${idCuenta}::uuid WHERE id = ${enA}::uuid`,
    );
    await http()
      .post(`/v1/gyms/${gymA}/members/${enA}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: planMensual })
      .expect(201);
    await pagarCuota(enA).expect(201);

    // En B: socia tambien, pero SIN cuota contratada.
    await http()
      .post(`/v1/gyms/${gymB}/invitations`)
      .set(conSesion(tokenOwnerB))
      .send({ email: email('socia-dos-gyms'), role: 'member' })
      .expect(201);
    const job = await owner.execute<{ data: { token: string } }>(
      sql`SELECT data FROM pgboss.job WHERE name = ${EMAIL_QUEUES.invitation}
          AND data->>'to' = ${email('socia-dos-gyms')} ORDER BY created_on DESC LIMIT 1`,
    );
    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(tokenSocio))
      .send({ token: job.rows[0]!.data.token })
      .expect(201);
    const enB = await altaSocio(gymB, tokenOwnerB, 'EnB');
    await owner.execute(
      sql`UPDATE members SET user_id = ${idCuenta}::uuid WHERE id = ${enB}::uuid`,
    );

    // En A esta al corriente.
    const cuotaEnA = await http().get('/v1/me/dues').set(conSesion(tokenSocio)).expect(200);
    expect(cuotaEnA.body.estado).toBe('AL_CORRIENTE');
    expect(cuotaEnA.body.planName).not.toBeNull();

    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(tokenSocio))
      .send({ gymId: gymB })
      .expect(201);

    // En B no tiene cuota, y no hereda la de A.
    const cuotaEnB = await http().get('/v1/me/dues').set(conSesion(tokenSocio)).expect(200);
    expect(cuotaEnB.body.estado).toBe('SIN_SUSCRIPCION');
    expect(cuotaEnB.body.planName).toBeNull();
    expect(cuotaEnB.body.puedeAcceder).toBe(false);

    // Y su ficha tambien es la de B: numero de socio distinto.
    const fichaEnB = await http()
      .get('/v1/me/member-profile')
      .set(conSesion(tokenSocio))
      .expect(200);
    expect(fichaEnB.body.id).toBe(enB);

    // Al volver a A, lo de A sigue estando.
    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(tokenSocio))
      .send({ gymId: gymA })
      .expect(201);
    const vuelta = await http().get('/v1/me/dues').set(conSesion(tokenSocio)).expect(200);
    expect(vuelta.body.estado).toBe('AL_CORRIENTE');
  });
});

describe('aislamiento entre gimnasios', () => {
  it('el dueno de B no ve los planes de A ni puede contratarlos', async () => {
    const planesB = await http()
      .get(`/v1/gyms/${gymB}/plans`)
      .set(conSesion(tokenOwnerB))
      .expect(200);
    expect(planesB.body).toHaveLength(0);

    const socioB = await altaSocio(gymB, tokenOwnerB, 'DeB');
    await http()
      .post(`/v1/gyms/${gymB}/members/${socioB}/subscription`)
      .set(conSesion(tokenOwnerB))
      .send({ planId: planMensual })
      .expect(404);
  });

  it('escribir el gymId de A en la ruta con sesion de B responde 403', async () => {
    await http().get(`/v1/gyms/${gymA}/plans`).set(conSesion(tokenOwnerB)).expect(403);
  });
});

describe('exportacion RGPD (ADR-0011)', () => {
  it('incluye cuotas y pagos, aportados por el modulo de facturacion', async () => {
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('Exporta', hoy);
    await pagarCuota(memberId, { note: 'Primera mensualidad' }).expect(201);

    const exp = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(exp.body.ficha.id).toBe(memberId);
    expect(exp.body.cuotasYPagos.cuotas).toHaveLength(1);
    expect(exp.body.cuotasYPagos.pagos).toHaveLength(1);
    expect(exp.body.cuotasYPagos.pagos[0].nota).toBe('Primera mensualidad');
  });

  it('un socio sin cuota exporta la seccion vacia, no un error', async () => {
    const memberId = await altaSocio(gymA, tokenOwnerA, 'SinNada');

    const exp = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(exp.body.cuotasYPagos.cuotas).toHaveLength(0);
    expect(exp.body.cuotasYPagos.pagos).toHaveLength(0);
  });

  it('borrar al socio conserva el pago desligado: obligacion fiscal (art. 17.3.b)', async () => {
    // La suscripcion se va en cascada; el pago sobrevive con importe y fecha,
    // sin ningun dato personal. El gimnasio cuadra sus cuentas y no queda
    // rastro de la persona.
    const hoy = await hoyDelGimnasio(gymA);
    const { memberId } = await socioConCuota('Borrado', hoy);
    const pago = await pagarCuota(memberId).expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${memberId}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const fila = await owner.execute<{ member_id: string | null; amount_cents: number }>(
      sql`SELECT member_id, amount_cents FROM payments WHERE id = ${pago.body.payment.id}::uuid`,
    );
    expect(fila.rows).toHaveLength(1);
    expect(fila.rows[0]!.member_id).toBeNull();
    expect(Number(fila.rows[0]!.amount_cents)).toBe(3000);

    const cuotas = await owner.execute(
      sql`SELECT id FROM member_subscriptions WHERE member_id = ${memberId}::uuid`,
    );
    expect(cuotas.rows).toHaveLength(0);
  });
});
