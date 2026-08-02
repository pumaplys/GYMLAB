/**
 * TESTS FUNCIONALES DE PROGRESO (peso y medidas)
 *
 * Categoria especial del RGPD (art. 9). El eje de la bateria es uno solo:
 * **sin consentimiento vigente no entra ni un dato**, y el bloqueo esta en el
 * servicio, asi que da igual el punto de entrada.
 *
 * La version del consentimiento se manipula por entorno dentro de cada test
 * —`env` se lee en caliente— para poder probar los tres estados: sin configurar,
 * configurada y sin aceptar, y aceptada.
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
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

const VERSION = '2026-09-01';

let gymA: string;
let tokenOwnerA: string;
let tokenRecepcionA: string;
let tokenEntrenador1: string;
let entrenador1: string;
let entrenador2: string;
let gymB: string;
let tokenOwnerB: string;

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Fija la version vigente del consentimiento para un test.
 *
 * `env` es el objeto ya validado, asi que escribir en el es lo que permite
 * probar el estado "todavia no hay texto legal" sin levantar otra aplicacion.
 */
function conVersion(valor: string | undefined) {
  (env as { HEALTH_CONSENT_VERSION?: string }).HEALTH_CONSENT_VERSION = valor;
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

function aceptar(gymId: string, token: string, memberId: string, version = VERSION) {
  return http()
    .post(`/v1/gyms/${gymId}/members/${memberId}/health-consent`)
    .set(conSesion(token))
    .send({ version });
}

function registrarPeso(gymId: string, token: string, memberId: string, kg = 72.4) {
  return http()
    .post(`/v1/gyms/${gymId}/members/${memberId}/progress`)
    .set(conSesion(token))
    .send({ weightKg: kg });
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
  tokenEntrenador1 = await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-1');
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
});

afterEach(() => conVersion(undefined));

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

describe('sin texto legal, no se registra nada', () => {
  it('registrar peso responde 403 con CONSENT_NOT_CONFIGURED', async () => {
    // ES EL ESTADO ACTUAL DEL PRODUCTO: el modulo esta listo y bloqueado a
    // proposito, porque no existe todavia el texto del consentimiento. Se
    // prefirio dejar el dato pendiente antes que inventar una version.
    conVersion(undefined);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinTexto');

    const res = await registrarPeso(gymA, tokenOwnerA, socio).expect(403);

    expect(res.body.code).toBe('CONSENT_NOT_CONFIGURED');
    expect(res.body.message).toMatch(/texto legal/i);
  });

  it('tampoco se puede aceptar un consentimiento que no existe', async () => {
    conVersion(undefined);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinTexto2');

    await aceptar(gymA, tokenOwnerA, socio).expect(400);
  });

  it('y no queda ni una fila en la base de datos', async () => {
    // El bloqueo no es cosmetico: se comprueba contra la tabla, no contra el
    // codigo de respuesta.
    conVersion(undefined);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinTexto3');
    await registrarPeso(gymA, tokenOwnerA, socio).expect(403);

    const filas = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM body_metrics WHERE member_id = ${socio}::uuid`,
    );
    expect(Number(filas.rows[0]!.n)).toBe(0);
  });
});

describe('con texto legal, hace falta que el socio lo acepte', () => {
  it('sin aceptacion responde 403 con CONSENT_REQUIRED', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinAceptar');

    const res = await registrarPeso(gymA, tokenOwnerA, socio).expect(403);

    expect(res.body.code).toBe('CONSENT_REQUIRED');
    expect(res.body.message).toContain(VERSION);
  });

  it('tras aceptar, se registra y guarda bajo que version', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Acepta');

    const estado = await aceptar(gymA, tokenOwnerA, socio).expect(201);
    expect(estado.body.accepted).toBe(true);
    expect(estado.body.currentVersion).toBe(VERSION);

    const medida = await registrarPeso(gymA, tokenOwnerA, socio, 72.4).expect(201);
    expect(medida.body.weightKg).toBe(72.4);
    // Ante una reclamacion hay que poder demostrar bajo que texto se recogio
    // CADA dato, no solo que hubo un consentimiento alguna vez.
    expect(medida.body.consentVersion).toBe(VERSION);
  });

  it('no se puede aceptar una version distinta de la vigente', async () => {
    // Sin esto, una app antigua registraria la aceptacion de un texto retirado.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'VersionVieja');

    await aceptar(gymA, tokenOwnerA, socio, '2020-01-01').expect(400);
  });

  it('un socio SIN cuenta puede consentir y tener datos', async () => {
    // Es el caso que el modelo anterior no sabia representar, y es justo quien
    // mas pasa por la bascula del entrenador: la persona que nunca instalara la
    // app. Su consentimiento se recoge en el mostrador.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinCuenta');

    await aceptar(gymA, tokenOwnerA, socio).expect(201);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);
  });
});

describe('cambiar la version exige aceptar de nuevo', () => {
  it('lo ya aceptado deja de valer al cambiar el texto', async () => {
    // LO QUE PEDISTE EXPLICITAMENTE. La validez se comprueba contra la version
    // exacta, asi que el consentimiento viejo caduca solo — nadie tiene que
    // acordarse de invalidarlo.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'CambioVersion');
    await aceptar(gymA, tokenOwnerA, socio).expect(201);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    conVersion('2027-01-01');

    const res = await registrarPeso(gymA, tokenOwnerA, socio).expect(403);
    expect(res.body.code).toBe('CONSENT_REQUIRED');

    // Y aceptando la nueva, vuelve a funcionar.
    await aceptar(gymA, tokenOwnerA, socio, '2027-01-01').expect(201);
    const nueva = await registrarPeso(gymA, tokenOwnerA, socio).expect(201);
    expect(nueva.body.consentVersion).toBe('2027-01-01');
  });

  it('revocar bloquea nuevos registros pero conserva los anteriores', async () => {
    // El consentimiento es revocable: es un derecho. Lo ya recogido sigue
    // consultable para poder atender una peticion de acceso o de borrado.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Revoca');
    await aceptar(gymA, tokenOwnerA, socio).expect(201);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio}/health-consent`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await registrarPeso(gymA, tokenOwnerA, socio).expect(403);

    const historial = await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(historial.body).toHaveLength(1);
  });
});

describe('la puerta esta en el servicio, no en el controlador', () => {
  it('el socio registrando su PROPIO peso pasa por el mismo bloqueo', async () => {
    // Otro punto de entrada, misma regla. Que uno mismo meta el dato no cambia
    // que sea categoria especial.
    conVersion(VERSION);
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-propio');
    const yo = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('socio-propio')}`,
    );
    const memberId = await altaSocio(gymA, tokenOwnerA, 'Propio');
    await owner.execute(
      sql`UPDATE members SET user_id = ${yo.rows[0]!.id}::uuid WHERE id = ${memberId}::uuid`,
    );

    const bloqueado = await http()
      .post('/v1/me/progress')
      .set(conSesion(tokenSocio))
      .send({ weightKg: 70 })
      .expect(403);
    expect(bloqueado.body.code).toBe('CONSENT_REQUIRED');

    await aceptar(gymA, tokenOwnerA, memberId).expect(201);

    await http()
      .post('/v1/me/progress')
      .set(conSesion(tokenSocio))
      .send({ weightKg: 70 })
      .expect(201);

    const mio = await http().get('/v1/me/progress').set(conSesion(tokenSocio)).expect(200);
    expect(mio.body).toHaveLength(1);
  });

  it('borrar una medicion tambien exige consentimiento vigente', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'BorraMedida');
    await aceptar(gymA, tokenOwnerA, socio).expect(201);
    const medida = await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    conVersion(undefined);
    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio}/progress/${medida.body.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(403);
  });
});

describe('quien puede ver datos de salud', () => {
  it('RECEPCION NO ACCEDE, ni para leer', async () => {
    // Minimizacion (art. 5.1.c) aplicada a los roles: quien atiende el mostrador
    // no necesita el peso de nadie para su trabajo.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Privado');

    await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenRecepcionA))
      .expect(403);
    await registrarPeso(gymA, tokenRecepcionA, socio).expect(403);
  });

  it('un entrenador solo ve los datos de SUS socios', async () => {
    conVersion(VERSION);
    const mio = await altaSocio(gymA, tokenOwnerA, 'MioSalud');
    const ajeno = await altaSocio(gymA, tokenOwnerA, 'AjenoSalud');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador1}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: mio })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador2}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: ajeno })
      .expect(201);
    await aceptar(gymA, tokenOwnerA, mio).expect(201);

    await registrarPeso(gymA, tokenEntrenador1, mio).expect(201);

    await http()
      .get(`/v1/gyms/${gymA}/members/${ajeno}/progress`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);
  });

  it('el gimnasio B no ve los datos de un socio de A', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'DeA');
    await aceptar(gymA, tokenOwnerA, socio).expect(201);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    await http()
      .get(`/v1/gyms/${gymB}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerB))
      .expect(404);
  });
});

describe('el dato', () => {
  it('los decimales sobreviven al viaje', async () => {
    // `numeric` y no coma flotante: 72,45 debe volver siendo 72,45.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Decimales');
    await aceptar(gymA, tokenOwnerA, socio).expect(201);

    await registrarPeso(gymA, tokenOwnerA, socio, 72.45).expect(201);

    const historial = await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(historial.body[0].weightKg).toBe(72.45);
  });

  it('una medicion vacia no se acepta', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Vacia');
    await aceptar(gymA, tokenOwnerA, socio).expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerA))
      .send({ notes: 'solo una nota' })
      .expect(400);
  });

  it('borrar la ficha del socio se lleva sus datos de salud', async () => {
    // Derecho al olvido (art. 17): aqui no hay excepcion contable que valga, al
    // contrario que con los pagos. Los datos de salud se van.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Olvido');
    await aceptar(gymA, tokenOwnerA, socio).expect(201);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const quedan = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM body_metrics WHERE member_id = ${socio}::uuid`,
    );
    expect(Number(quedan.rows[0]!.n)).toBe(0);
  });
});
