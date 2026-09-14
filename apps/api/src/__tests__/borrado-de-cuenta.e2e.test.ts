/**
 * BORRADO DE CUENTA — ARTICULO 17 EJERCIDO POR LA PROPIA PERSONA
 *
 * Contra un PostgreSQL real y con RLS activa. Un mock de RLS solo probaria el
 * mock, y aqui lo que se comprueba es justo que el aislamiento entre gimnasios
 * se mantiene mientras se borra en varios a la vez.
 *
 * Requiere:
 *   docker compose up -d
 *   pnpm db:migrate
 */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  closeDatabase,
  createDatabase,
  sql,
  type Database,
} from '@gymlab/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { env } from '../config/env';

let app: INestApplication;
let owner: Database;
let http: () => request.Agent;

const sufijo = randomUUID().slice(0, 8);
const correo = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

const gimnasios: string[] = [];

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 2 });
});

afterAll(async () => {
  await app?.close();
  if (!owner) return;
  const patron = `%-${sufijo}@test.local`;
  if (gimnasios.length > 0) {
    const ids = sql.raw(gimnasios.map((g) => `'${g}'::uuid`).join(','));
    const orgs = await owner.execute<{ organization_id: string }>(
      sql`SELECT DISTINCT organization_id FROM gyms WHERE id IN (${ids})`,
    );
    await owner.execute(sql`DELETE FROM invitations WHERE gym_id IN (${ids})`);
    await owner.execute(sql`DELETE FROM audit_log WHERE gym_id IN (${ids})`);
    await owner.execute(sql`DELETE FROM memberships WHERE gym_id IN (${ids})`);
    await owner.execute(sql`DELETE FROM gyms WHERE id IN (${ids})`);
    if (orgs.rows.length > 0) {
      const orgIds = sql.raw(orgs.rows.map((o) => `'${o.organization_id}'::uuid`).join(','));
      await owner.execute(sql`DELETE FROM organizations WHERE id IN (${orgIds})`);
    }
  }
  await owner.execute(sql`DELETE FROM auth_events WHERE email_attempted LIKE ${patron}`);
  await owner.execute(sql`DELETE FROM users WHERE email LIKE ${patron}`);
  await closeDatabase(owner);
});

// --- Utiles del banco de pruebas -----------------------------------------

/** Un gimnasio nuevo con su dueño. Devuelve la sesion del dueño. */
async function nuevoGimnasio(nombre: string) {
  const r = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: `Org ${nombre}`,
      gymName: `Gym ${nombre}`,
      ownerName: `Duena ${nombre}`,
      email: correo(`owner-${nombre.toLowerCase()}`),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  gimnasios.push(r.body.activeGymId);
  return { token: r.body.token as string, gymId: r.body.activeGymId as string };
}

/**
 * Invita a alguien y acepta la invitacion creando una cuenta nueva.
 *
 * Este es literalmente el flujo por el que RINDA «permite crear cuenta»: lo que
 * obliga a que exista el borrado.
 */
async function invitarYAceptar(
  tokenQuienInvita: string,
  gymId: string,
  rol: 'receptionist' | 'trainer',
  quien: string,
) {
  const email = correo(quien);
  await http()
    .post(`/v1/gyms/${gymId}/invitations`)
    .set(conSesion(tokenQuienInvita))
    .send({ email, role: rol })
    .expect(201);

  const [fila] = (
    await owner.execute<{ token_hash: string }>(
      sql`SELECT token_hash FROM invitations WHERE email = ${email} AND gym_id = ${gymId}::uuid`,
    )
  ).rows;
  expect(fila, 'la invitacion deberia existir').toBeTruthy();

  // El token en claro no se guarda; se emite uno nuevo con el mismo hash a
  // traves del propio flujo de la aplicacion.
  return { email, tokenHash: fila!.token_hash };
}

const existeUsuario = async (email: string) =>
  (await owner.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users WHERE email = ${email}`))
    .rows[0]!.n > 0;

describe('bloqueo por ser el único dueño', () => {
  it('una dueña sola no puede borrarse, y se le dice qué gimnasio lo impide', async () => {
    const a = await nuevoGimnasio('Sola');

    const previo = await http()
      .get('/v1/me/erasure-preview')
      .set(conSesion(a.token))
      .expect(200);

    expect(previo.body.puedeBorrarse).toBe(false);
    expect(previo.body.bloqueos).toHaveLength(1);
    expect(previo.body.bloqueos[0].gymId).toBe(a.gymId);
    expect(previo.body.bloqueos[0].nombre).toBe('Gym Sola');

    const borrado = await http().delete('/v1/me').set(conSesion(a.token)).expect(200);
    expect(borrado.body.ok).toBe(false);

    /*
     * Y —esto es lo que de verdad importa— NO se ha borrado nada por el camino.
     * Un bloqueo que ya hubiera borrado media identidad seria peor que no
     * tener bloqueo.
     */
    const sesion = await http().get('/v1/auth/me').set(conSesion(a.token)).expect(200);
    expect(sesion.body.user.email).toBe(correo('owner-sola'));
  });
});

describe('el borrado de una cuenta de personal', () => {
  it('deja de existir, la sesión muere y no se puede volver a entrar', async () => {
    const gimnasio = await nuevoGimnasio('Recepcion');
    const { email } = await invitarYAceptar(
      gimnasio.token,
      gimnasio.gymId,
      'receptionist',
      'recepcion',
    );

    // La cuenta se crea aceptando la invitacion, que es el flujo real.
    const aceptada = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: await tokenDeInvitacion(email), name: 'Rita', password: PASSWORD })
      .expect(201);
    const tokenRecepcion = aceptada.body.token as string;

    expect(await existeUsuario(email)).toBe(true);

    const borrado = await http().delete('/v1/me').set(conSesion(tokenRecepcion)).expect(200);
    expect(borrado.body.ok).toBe(true);

    expect(await existeUsuario(email)).toBe(false);

    // La sesion que pidio el borrado ya no vale.
    await http().get('/v1/auth/me').set(conSesion(tokenRecepcion)).expect(401);

    // Y no se puede volver a entrar con esas credenciales.
    await http().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(401);
  });

  it('y quien invitó a alguien ya no queda bloqueado por la clave ajena', async () => {
    /*
     * Antes de la migracion 0018 esto terminaba en un 500: `invitations
     * .invited_by_user_id` era ON DELETE RESTRICT y PostgreSQL rechazaba borrar
     * la cuenta de cualquiera que hubiera invitado a alguien.
     */
    const gimnasio = await nuevoGimnasio('Invita');
    const segundo = await http()
      .post(`/v1/gyms/${gimnasio.gymId}/invitations`)
      .set(conSesion(gimnasio.token))
      .send({ email: correo('otro-owner'), role: 'owner' })
      .expect(201);
    expect(segundo.status).toBe(201);

    const email2 = correo('otro-owner');
    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: await tokenDeInvitacion(email2), name: 'Otra', password: PASSWORD })
      .expect(201);

    // Ya hay dos dueños: la primera puede irse.
    const borrado = await http().delete('/v1/me').set(conSesion(gimnasio.token)).expect(200);
    expect(borrado.body.ok).toBe(true);

    // La invitacion sigue ahi como hecho, sin su autora.
    const inv = await owner.execute<{ invited_by_user_id: string | null }>(
      sql`SELECT invited_by_user_id FROM invitations WHERE email = ${email2}`,
    );
    expect(inv.rows[0]!.invited_by_user_id).toBeNull();
  });
});

/**
 * Emite un token de invitacion nuevo para un correo ya invitado.
 *
 * El token en claro no se guarda —solo su hash—, asi que para aceptarla en un
 * test hay que provocar que la aplicacion emita otro. Se reenvia la invitacion
 * por el mismo endpoint, que devuelve el token en entorno de pruebas.
 */
async function tokenDeInvitacion(email: string): Promise<string> {
  const r = await owner.execute<{ token: string }>(
    sql`SELECT data->>'token' AS token FROM pgboss.job
        WHERE name = 'email.invitation' AND data->>'to' = ${email}
        ORDER BY created_on DESC LIMIT 1`,
  );
  const token = r.rows[0]?.token;
  expect(token, `no hay token de invitacion para ${email}`).toBeTruthy();
  return token!;
}

describe('una socia en DOS gimnasios se borra en los dos', () => {
  it('y lo que es hecho economico u operativo sobrevive sin ella', async () => {
    const a = await nuevoGimnasio('Multi1');
    const b = await nuevoGimnasio('Multi2');
    const email = correo('socia-multi');

    /*
     * La misma persona, socia de dos gimnasios que no se conocen. Es el caso
     * que el aislamiento por RLS vuelve traicionero: con el contexto de uno,
     * la ficha del otro es invisible.
     */
    const fichas: { gymId: string; memberId: string }[] = [];
    for (const [i, g] of [a, b].entries()) {
      const alta = await http()
        .post(`/v1/gyms/${g.gymId}/members`)
        .set(conSesion(g.token))
        .send({ firstName: 'Sara', lastName: `Multi${i}`, email })
        .expect(201);
      fichas.push({ gymId: g.gymId, memberId: alta.body.id });

      await http()
        .post(`/v1/gyms/${g.gymId}/members/${alta.body.id}/invite`)
        .set(conSesion(g.token))
        .expect(201);
    }

    /*
     * Los DOS tokens se recogen ANTES de usar ninguno. Aceptar consume uno, y
     * pedir «el ultimo» despues devolvia el mismo ya gastado: la vinculacion
     * se caia con un 400 que no tenia nada que ver con el borrado.
     */
    const [tokenA, tokenB] = await tokensDeInvitacion(email, 2);

    // Una sola cuenta: la primera invitacion la crea, la segunda se vincula.
    const sesion = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: tokenA, name: 'Sara', password: PASSWORD })
      .expect(201);
    const tokenSocia = sesion.body.token as string;

    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(tokenSocia))
      .send({ token: tokenB })
      .expect(201);

    const userId = (
      await owner.execute<{ id: string }>(sql`SELECT id FROM users WHERE email = ${email}`)
    ).rows[0]!.id;

    /*
     * Datos de las tres clases que el mapa de borrado trata distinto:
     * salud (DELETE), pago (ANONYMIZE) y acceso (ANONYMIZE).
     */
    await owner.execute(sql`
      INSERT INTO body_metrics (gym_id, member_id, measured_at, weight_kg, consent_version)
      VALUES (${fichas[0]!.gymId}::uuid, ${fichas[0]!.memberId}::uuid, now(), 70.0, 'v-test')`);
    await owner.execute(sql`
      INSERT INTO payments (gym_id, member_id, concept, amount_cents, currency, method, paid_on)
      VALUES (${fichas[0]!.gymId}::uuid, ${fichas[0]!.memberId}::uuid, 'subscription', 3000, 'EUR', 'cash', current_date)`);
    await owner.execute(sql`
      INSERT INTO access_events (gym_id, member_id, decision, reason, jti, occurred_at)
      VALUES (${fichas[0]!.gymId}::uuid, ${fichas[0]!.memberId}::uuid, 'ALLOW', 'OK', ${randomUUID()}, now())`);

    const borrado = await http().delete('/v1/me').set(conSesion(tokenSocia)).expect(200);
    expect(borrado.body.ok).toBe(true);

    // --- La identidad, entera y en los dos gimnasios ---------------------
    expect(await existeUsuario(email)).toBe(false);
    const fichasVivas = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM members WHERE email = ${email}`,
    );
    expect(fichasVivas.rows[0]!.n, 'no debe quedar ninguna ficha en ningún gimnasio').toBe(0);

    const pertenencias = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM memberships WHERE user_id = ${userId}::uuid`,
    );
    expect(pertenencias.rows[0]!.n).toBe(0);

    // --- Salud: DELETE ----------------------------------------------------
    const salud = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM body_metrics WHERE member_id = ${fichas[0]!.memberId}::uuid`,
    );
    expect(salud.rows[0]!.n, 'las mediciones deben desaparecer').toBe(0);

    // --- Pago: sobrevive, sin ella ---------------------------------------
    const pago = await owner.execute<{ n: number; member_id: string | null }>(
      sql`SELECT count(*)::int AS n, min(member_id::text) AS member_id
          FROM payments WHERE gym_id = ${fichas[0]!.gymId}::uuid AND concept = 'subscription'`,
    );
    expect(pago.rows[0]!.n, 'el hecho economico se conserva').toBe(1);
    expect(pago.rows[0]!.member_id, 'pero ya no apunta a nadie').toBeNull();

    // --- Acceso: igual ----------------------------------------------------
    const acceso = await owner.execute<{ n: number; member_id: string | null }>(
      sql`SELECT count(*)::int AS n, min(member_id::text) AS member_id
          FROM access_events WHERE gym_id = ${fichas[0]!.gymId}::uuid`,
    );
    expect(acceso.rows[0]!.n).toBe(1);
    expect(acceso.rows[0]!.member_id).toBeNull();

    // --- Y la PII que no cuelga de ninguna clave ajena --------------------
    const rastro = await owner.execute<{ n: number }>(sql`
      SELECT ((SELECT count(*) FROM auth_events WHERE email_attempted = ${email})
           + (SELECT count(*) FROM invitations WHERE email = ${email}))::int AS n`);
    expect(rastro.rows[0]!.n, 'ni en auth_events ni en invitations debe quedar el correo').toBe(0);
  });
});

/** Todos los tokens de invitacion emitidos para un correo, en orden de emisión. */
async function tokensDeInvitacion(email: string, cuantos: number): Promise<string[]> {
  const r = await owner.execute<{ token: string }>(
    sql`SELECT data->>'token' AS token FROM pgboss.job
        WHERE name = 'email.invitation' AND data->>'to' = ${email}
        ORDER BY created_on ASC`,
  );
  const tokens = r.rows.map((f) => f.token).filter(Boolean);
  expect(
    tokens.length,
    `se esperaban ${cuantos} invitaciones para ${email}`,
  ).toBeGreaterThanOrEqual(cuantos);
  return tokens;
}
