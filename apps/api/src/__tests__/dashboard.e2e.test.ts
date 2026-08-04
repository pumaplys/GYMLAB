/**
 * TESTS DEL PANEL DEL DUENO
 *
 * Aqui no hay tablas ni escrituras: lo que puede fallar es que un numero este
 * mal, y un numero mal no da error — se cree. Por eso la bateria construye
 * situaciones donde el calculo ingenuo da un resultado DISTINTO del correcto:
 *
 *   - un socio con DOS entrenadores (sumar contadores lo contaria dos veces),
 *   - un socio que entra CUATRO veces (contar entradas no es contar personas),
 *   - un reintento de escaner (no es una entrada mas),
 *   - un pago anulado (no es facturacion).
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
let escaner: string;
let entrenador1: string;
let entrenador2: string;
let planA: string;
let gymB: string;
let tokenOwnerB: string;

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

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

async function altaPersonal(gymId: string, staff: string, rol: string, quien: string) {
  await http()
    .post(`/v1/gyms/${gymId}/invitations`)
    .set(conSesion(staff))
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

/**
 * Mueve el vencimiento de la cuota N dias respecto de HOY EN EL GIMNASIO.
 *
 * No es `now()::date`: esa es la fecha del servidor, y el panel reparte las
 * cuotas —al corriente, por vencer, vencidas— usando la zona del gimnasio. Con
 * el servidor en UTC y el gimnasio en Europe/Madrid, las dos ultimas horas del
 * dia UTC caen ya en el dia siguiente del gimnasio y el reparto se desplaza un
 * dia. Ver el comentario largo en `access.e2e.test.ts`, que es donde delato.
 */
async function venceEn(memberId: string, dias: number) {
  await owner.execute(sql`
    UPDATE member_subscriptions s
    SET current_period_end = (now() AT TIME ZONE g.timezone)::date + ${dias}::int
    FROM gyms g
    WHERE g.id = s.gym_id AND s.member_id = ${memberId}::uuid
  `);
}

/** Socio con cuenta, ficha, cuota pagada y sesion propia. */
async function socioCompleto(quien: string) {
  const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', quien);
  const yo = await owner.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${email(quien)}`,
  );
  const ficha = await http()
    .post(`/v1/gyms/${gymA}/members`)
    .set(conSesion(tokenOwnerA))
    .send({ firstName: 'Socio', lastName: quien })
    .expect(201);
  await owner.execute(
    sql`UPDATE members SET user_id = ${yo.rows[0]!.id}::uuid WHERE id = ${ficha.body.id}::uuid`,
  );
  await http()
    .post(`/v1/gyms/${gymA}/members/${ficha.body.id}/subscription`)
    .set(conSesion(tokenOwnerA))
    .send({ planId: planA })
    .expect(201);
  await http()
    .post(`/v1/gyms/${gymA}/members/${ficha.body.id}/payments`)
    .set(conSesion(tokenOwnerA))
    .send({ concept: 'subscription', amountCents: 3000, method: 'cash' })
    .expect(201);

  return { tokenSocio, memberId: ficha.body.id as string };
}

async function entrar(tokenSocio: string) {
  const qr = await http().post('/v1/me/access/token').set(conSesion(tokenSocio)).expect(201);
  return http()
    .post(`/v1/gyms/${gymA}/access/verify`)
    .set(conSesion(escaner))
    .send({ token: qr.body.token })
    .expect(201);
}

function panel(dias?: number) {
  const ruta = dias ? `/v1/gyms/${gymA}/dashboard?dias=${dias}` : `/v1/gyms/${gymA}/dashboard`;
  return http().get(ruta).set(conSesion(tokenOwnerA));
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
  escaner = tokenRecepcionA;
  await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-1');
  await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-2');

  const entrenadores = await http()
    .get(`/v1/gyms/${gymA}/trainers`)
    .set(conSesion(tokenOwnerA))
    .expect(200);
  entrenador1 = entrenadores.body.find(
    (t: { email: string }) => t.email === email('entrenador-1'),
  ).id;
  entrenador2 = entrenadores.body.find(
    (t: { email: string }) => t.email === email('entrenador-2'),
  ).id;

  const plan = await http()
    .post(`/v1/gyms/${gymA}/plans`)
    .set(conSesion(tokenOwnerA))
    .send({ name: 'Mensual', priceCents: 3000, period: 'monthly' })
    .expect(201);
  planA = plan.body.id;
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
      'body_metrics',
      'consents',
      'routine_assignments',
      'routine_items',
      'routines',
      'exercises',
      'access_events',
      'access_tokens',
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

describe('los dos numeros que era facil calcular mal', () => {
  it('un socio con DOS entrenadores cuenta UNA vez', async () => {
    // Si se sumaran los `activeMembers` de cada entrenador, este socio saldria
    // dos veces y el dueno veria mas gente atendida de la que tiene. Es el error
    // que solo se detecta cuando los numeros ya estan mal.
    const socio = await socioCompleto('dos-entrenadores');
    for (const entrenador of [entrenador1, entrenador2]) {
      await http()
        .post(`/v1/gyms/${gymA}/trainers/${entrenador}/members`)
        .set(conSesion(tokenOwnerA))
        .send({ memberId: socio.memberId })
        .expect(201);
    }

    const res = await panel().expect(200);

    expect(res.body.entrenamiento.sociosConEntrenador).toBe(1);
    expect(res.body.entrenamiento.entrenadoresActivos).toBe(2);
  });

  it('un socio que entra CUATRO veces cuenta UNA en socios distintos', async () => {
    // "Cuanto se usa el gimnasio" y "cuanta gente lo usa" son preguntas
    // distintas, y el dueno decide cosas distintas con cada una.
    const socio = await socioCompleto('cuatro-veces');
    for (let i = 0; i < 4; i++) await entrar(socio.tokenSocio);

    const res = await panel().expect(200);

    expect(res.body.asistencia.entradas).toBeGreaterThanOrEqual(4);
    expect(res.body.asistencia.sociosDistintos).toBe(1);
  });
});

describe('lo que NO debe contar', () => {
  it('la repeticion de un reintento de red no es una entrada mas', async () => {
    const socio = await socioCompleto('reintento');
    const qr = await http()
      .post('/v1/me/access/token')
      .set(conSesion(socio.tokenSocio))
      .expect(201);

    const primera = await http()
      .post(`/v1/gyms/${gymA}/access/verify`)
      .set(conSesion(escaner))
      .send({ token: qr.body.token })
      .expect(201);
    expect(primera.body.decision).toBe('ALLOW');

    const antes = (await panel().expect(200)).body.asistencia.entradas;

    // Mismo escaner, mismo token, dentro de la ventana: es un reintento.
    const repe = await http()
      .post(`/v1/gyms/${gymA}/access/verify`)
      .set(conSesion(escaner))
      .send({ token: qr.body.token })
      .expect(201);
    expect(repe.body.isRetry).toBe(true);

    const despues = (await panel().expect(200)).body.asistencia.entradas;
    expect(despues).toBe(antes);
  });

  it('un pago anulado no cuenta como ingreso', async () => {
    // Sumarlo convertiria la correccion de un error de tecleo en facturacion
    // inventada.
    const socio = await socioCompleto('anulado');
    const antes = (await panel().expect(200)).body.cuotas.ingresosDelMesCents;

    const pago = await http()
      .post(`/v1/gyms/${gymA}/members/${socio.memberId}/payments`)
      .set(conSesion(tokenOwnerA))
      .send({ concept: 'other', amountCents: 5000, method: 'cash' })
      .expect(201);

    expect((await panel().expect(200)).body.cuotas.ingresosDelMesCents).toBe(antes + 5000);

    await http()
      .post(`/v1/gyms/${gymA}/payments/${pago.body.payment.id}/void`)
      .set(conSesion(tokenOwnerA))
      .send({ reason: 'Apuntado dos veces' })
      .expect(201);

    expect((await panel().expect(200)).body.cuotas.ingresosDelMesCents).toBe(antes);
  });

  it('un acceso denegado no suma asistencia, pero si aparece aparte', async () => {
    const socio = await socioCompleto('denegado');
    await venceEn(socio.memberId, -30);

    const antes = await panel().expect(200);
    const res = await entrar(socio.tokenSocio);
    expect(res.body.decision).toBe('DENY');

    const despues = await panel().expect(200);
    expect(despues.body.asistencia.entradas).toBe(antes.body.asistencia.entradas);
    expect(despues.body.asistencia.accesosDenegados).toBe(
      antes.body.asistencia.accesosDenegados + 1,
    );
  });
});

describe('cuotas', () => {
  it('un socio activo SIN cuota aparece como agujero', async () => {
    // Es la metrica que mas vale del bloque: dinero que el gimnasio cree cobrar
    // y no cobra, y que no sale en ninguna otra pantalla.
    const antes = (await panel().expect(200)).body.cuotas.sinSuscripcion;

    await http()
      .post(`/v1/gyms/${gymA}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ firstName: 'Sin', lastName: 'Cuota' })
      .expect(201);

    expect((await panel().expect(200)).body.cuotas.sinSuscripcion).toBe(antes + 1);
  });

  it('las cuotas se reparten entre al corriente, por vencer y vencidas', async () => {
    const socio = await socioCompleto('semaforo-panel');
    const base = await panel().expect(200);
    expect(base.body.cuotas.alCorriente).toBeGreaterThan(0);

    // Se acerca al vencimiento: pasa de "al corriente" a "por vencer".
    await venceEn(socio.memberId, 3);
    const cerca = await panel().expect(200);
    expect(cerca.body.cuotas.porVencer).toBe(base.body.cuotas.porVencer + 1);
    expect(cerca.body.cuotas.alCorriente).toBe(base.body.cuotas.alCorriente - 1);

    // Y vencida.
    await venceEn(socio.memberId, -3);
    const vencida = await panel().expect(200);
    expect(vencida.body.cuotas.vencidas).toBe(base.body.cuotas.vencidas + 1);
  });
});

describe('socios', () => {
  it('el alta y la baja del mes se cuentan por separado', async () => {
    const antes = (await panel().expect(200)).body.socios;

    const ficha = await http()
      .post(`/v1/gyms/${gymA}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ firstName: 'Alta', lastName: 'DelMes' })
      .expect(201);

    const conAlta = (await panel().expect(200)).body.socios;
    expect(conAlta.altasDelMes).toBe(antes.altasDelMes + 1);
    expect(conAlta.activos).toBe(antes.activos + 1);

    await http()
      .post(`/v1/gyms/${gymA}/members/${ficha.body.id}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    const conBaja = (await panel().expect(200)).body.socios;
    expect(conBaja.bajasDelMes).toBe(antes.bajasDelMes + 1);
    expect(conBaja.activos).toBe(antes.activos);
    // El alta no se borra al dar de baja: son dos hechos distintos del mes.
    expect(conBaja.altasDelMes).toBe(antes.altasDelMes + 1);
  });
});

describe('quien puede verlo, y de quien', () => {
  it('solo el dueno: aqui hay ingresos y deudas', async () => {
    await http().get(`/v1/gyms/${gymA}/dashboard`).set(conSesion(tokenRecepcionA)).expect(403);
  });

  it('el dueno de B no ve los numeros de A', async () => {
    await http().get(`/v1/gyms/${gymA}/dashboard`).set(conSesion(tokenOwnerB)).expect(403);

    // Y su propio panel esta a cero, no muestra los de A.
    const suyo = await http()
      .get(`/v1/gyms/${gymB}/dashboard`)
      .set(conSesion(tokenOwnerB))
      .expect(200);
    expect(suyo.body.socios.activos).toBe(0);
    expect(suyo.body.asistencia.entradas).toBe(0);
    expect(suyo.body.cuotas.ingresosDelMesCents).toBe(0);
  });
});

describe('la ventana de asistencia', () => {
  it('por defecto son 30 dias y se puede acotar', async () => {
    const porDefecto = await panel().expect(200);
    expect(porDefecto.body.diasDeAsistencia).toBe(30);

    const corta = await panel(7).expect(200);
    expect(corta.body.diasDeAsistencia).toBe(7);
    expect(corta.body.asistencia.entradas).toBeLessThanOrEqual(porDefecto.body.asistencia.entradas);
  });

  it('se rechaza una ventana mayor de 90 dias', async () => {
    // Mas alla deja de ser un panel y pasa a ser un informe, con otro coste. Y
    // ademas `access_events` se purga por retencion: pedir mas no daria mas.
    await http().get(`/v1/gyms/${gymA}/dashboard?dias=365`).set(conSesion(tokenOwnerA)).expect(400);
  });

  it('un parametro invalido da 400 en TODOS los listados, no un 500', async () => {
    // HALLAZGO ENCONTRADO ESCRIBIENDO ESTE MODULO, y estaba en dos ya fusionados.
    //
    // Los listados llamaban a `schema.parse(query)` dentro del controlador, y
    // `parse` lanza un ZodError crudo que NestJS no traduce: cualquier parametro
    // mal escrito devolvia 500. Un 500 dice "fallo del servidor" cuando el fallo
    // es del cliente, y esconde los errores de verdad entre el ruido.
    await http()
      .get(`/v1/gyms/${gymA}/members?pageSize=9999`)
      .set(conSesion(tokenOwnerA))
      .expect(400);

    await http()
      .get(`/v1/gyms/${gymA}/access/events?pageSize=9999`)
      .set(conSesion(tokenOwnerA))
      .expect(400);

    await http()
      .get(`/v1/gyms/${gymA}/dashboard?dias=cero`)
      .set(conSesion(tokenOwnerA))
      .expect(400);
  });

  it('la serie diaria viene ordenada y suma lo mismo que el total', async () => {
    const res = await panel().expect(200);
    const dias = res.body.asistencia.porDia as { dia: string; entradas: number }[];

    expect(dias.length).toBeGreaterThan(0);
    expect([...dias].sort((a, b) => a.dia.localeCompare(b.dia))).toEqual(dias);
    expect(dias.reduce((t, d) => t + d.entradas, 0)).toBe(res.body.asistencia.entradas);
  });
});
