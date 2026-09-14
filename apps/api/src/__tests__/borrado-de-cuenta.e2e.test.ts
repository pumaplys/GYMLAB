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

    const borrado = await http().delete('/v1/me').send({ password: PASSWORD }).set(conSesion(a.token)).expect(200);
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

    const borrado = await http().delete('/v1/me').send({ password: PASSWORD }).set(conSesion(tokenRecepcion)).expect(200);
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
    const borrado = await http().delete('/v1/me').send({ password: PASSWORD }).set(conSesion(gimnasio.token)).expect(200);
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

    const borrado = await http().delete('/v1/me').send({ password: PASSWORD }).set(conSesion(tokenSocia)).expect(200);
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

describe('la puerta de identidad: reautenticación', () => {
  it('sin sesión no se puede ni consultar ni borrar', async () => {
    await http().get('/v1/me/erasure-preview').expect(401);
    await http().delete('/v1/me').send({ password: PASSWORD }).expect(401);
  });

  it('con la contraseña equivocada se rechaza y no se borra nada', async () => {
    const gimnasio = await nuevoGimnasio('Clave');
    const { email } = await invitarYAceptar(gimnasio.token, gimnasio.gymId, 'trainer', 'entrena');
    const sesion = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: await tokenDeInvitacion(email), name: 'Tina', password: PASSWORD })
      .expect(201);

    await http()
      .delete('/v1/me')
      .send({ password: 'esta-no-es-la-suya-1' })
      .set(conSesion(sesion.body.token))
      .expect(401);

    // Sigue existiendo y su sesion sigue valiendo.
    expect(await existeUsuario(email)).toBe(true);
    await http().get('/v1/auth/me').set(conSesion(sesion.body.token)).expect(200);
  });

  it('sin contraseña el contrato lo rechaza antes de llegar al servicio', async () => {
    const gimnasio = await nuevoGimnasio('SinClave');
    await http().delete('/v1/me').send({}).set(conSesion(gimnasio.token)).expect(400);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ QUE A NO PUEDA BORRAR A B NO SE PRUEBA MANDANDO EL ID DE B.          │
   * │                                                                      │
   * │ El contrato NO tiene campo para un identificador: no hay nada que    │
   * │ mandar. Lo que si se puede comprobar es la consecuencia —que tras    │
   * │ borrarse A, B sigue entera y entrando— y que colar el id de B por el │
   * │ cuerpo no cambia nada, porque se ignora.                             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('una cuenta no puede borrar otra, ni colando su id en el cuerpo', async () => {
    const gimnasio = await nuevoGimnasio('Ajena');
    const { email: emailB } = await invitarYAceptar(
      gimnasio.token,
      gimnasio.gymId,
      'receptionist',
      'victima',
    );
    const sesionB = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: await tokenDeInvitacion(emailB), name: 'Bea', password: PASSWORD })
      .expect(201);

    const { email: emailA } = await invitarYAceptar(
      gimnasio.token,
      gimnasio.gymId,
      'trainer',
      'atacante',
    );
    const sesionA = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: await tokenDeInvitacion(emailA), name: 'Ana', password: PASSWORD })
      .expect(201);

    const idDeB = (
      await owner.execute<{ id: string }>(sql`SELECT id FROM users WHERE email = ${emailB}`)
    ).rows[0]!.id;

    await http()
      .delete('/v1/me')
      .send({ password: PASSWORD, userId: idDeB, id: idDeB })
      .set(conSesion(sesionA.body.token))
      .expect(200);

    // Se borro A, la de la sesion. B sigue entera.
    expect(await existeUsuario(emailA)).toBe(false);
    expect(await existeUsuario(emailB)).toBe(true);
    await http().get('/v1/auth/me').set(conSesion(sesionB.body.token)).expect(200);
  });

  it('una sesión ya cerrada no puede ejecutarlo', async () => {
    const gimnasio = await nuevoGimnasio('Revocada');
    const { email } = await invitarYAceptar(gimnasio.token, gimnasio.gymId, 'trainer', 'revocada');
    const sesion = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: await tokenDeInvitacion(email), name: 'Rosa', password: PASSWORD })
      .expect(201);
    const token = sesion.body.token as string;

    await http().post('/v1/auth/logout').set(conSesion(token));

    await http().delete('/v1/me').send({ password: PASSWORD }).set(conSesion(token)).expect(401);
    expect(await existeUsuario(email)).toBe(true);
  });
});

describe('dueña única, con más de un gimnasio de por medio', () => {
  /** Invita a alguien como dueño de un gimnasio y acepta, creando su cuenta. */
  async function segundaDuena(tokenQuienInvita: string, gymId: string, quien: string) {
    const email = correo(quien);
    await http()
      .post(`/v1/gyms/${gymId}/invitations`)
      .set(conSesion(tokenQuienInvita))
      .send({ email, role: 'owner' })
      .expect(201);
    const r = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: await tokenDeInvitacion(email), name: 'Dos', password: PASSWORD })
      .expect(201);
    return { email, token: r.body.token as string };
  }

  it('A · socia en un gimnasio y dueña única en otro: bloqueada, y el primero intacto', async () => {
    const a = await nuevoGimnasio('CasoA1');
    const b = await nuevoGimnasio('CasoA2');
    const email = correo('caso-a');

    // Ficha de socia en A.
    const alta = await http()
      .post(`/v1/gyms/${a.gymId}/members`)
      .set(conSesion(a.token))
      .send({ firstName: 'Alba', lastName: 'Caso', email })
      .expect(201);
    await http()
      .post(`/v1/gyms/${a.gymId}/members/${alta.body.id}/invite`)
      .set(conSesion(a.token))
      .expect(201);
    const sesion = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: await tokenDeInvitacion(email), name: 'Alba', password: PASSWORD })
      .expect(201);
    const token = sesion.body.token as string;

    // Y dueña UNICA en B: se le invita como dueña y la fundadora se va.
    await http()
      .post(`/v1/gyms/${b.gymId}/invitations`)
      .set(conSesion(b.token))
      .send({ email, role: 'owner' })
      .expect(201);
    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(token))
      .send({ token: (await tokensDeInvitacion(email, 2)).at(-1)! })
      .expect(201);
    await http().delete('/v1/me').send({ password: PASSWORD }).set(conSesion(b.token)).expect(200);

    const previo = await http().get('/v1/me/erasure-preview').set(conSesion(token)).expect(200);
    expect(previo.body.puedeBorrarse, 'debería bloquearla el gimnasio B').toBe(false);
    expect(previo.body.bloqueos.map((x: { gymId: string }) => x.gymId)).toEqual([b.gymId]);

    const borrado = await http()
      .delete('/v1/me')
      .send({ password: PASSWORD })
      .set(conSesion(token))
      .expect(200);
    expect(borrado.body.ok).toBe(false);

    // NADA de A se ha tocado, y la sesión sigue valiendo.
    const fichaA = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM members WHERE gym_id = ${a.gymId}::uuid AND email = ${email}`,
    );
    expect(fichaA.rows[0]!.n, 'la ficha del gimnasio A no se toca').toBe(1);
    expect(await existeUsuario(email)).toBe(true);
    await http().get('/v1/auth/me').set(conSesion(token)).expect(200);
  });

  it('B · dueña de dos gimnasios con relevo en los dos: puede borrarse', async () => {
    const uno = await nuevoGimnasio('CasoB1');
    const dos = await nuevoGimnasio('CasoB2');

    // La dueña de `uno` pasa a serlo tambien de `dos`.
    await http()
      .post(`/v1/gyms/${dos.gymId}/invitations`)
      .set(conSesion(dos.token))
      .send({ email: correo('owner-casob1'), role: 'owner' })
      .expect(201);
    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(uno.token))
      .send({ token: await tokenDeInvitacion(correo('owner-casob1')) })
      .expect(201);

    // Relevo en los dos: `dos` conserva a su fundadora; `uno` necesita otra.
    await segundaDuena(uno.token, uno.gymId, 'relevo-b');

    const previo = await http().get('/v1/me/erasure-preview').set(conSesion(uno.token)).expect(200);
    expect(
      previo.body.puedeBorrarse,
      previo.body.bloqueos.map((b: { nombre: string }) => b.nombre).join(),
    ).toBe(true);

    const borrado = await http()
      .delete('/v1/me')
      .send({ password: PASSWORD })
      .set(conSesion(uno.token))
      .expect(200);
    expect(borrado.body.ok).toBe(true);
  });

  it('C · un relevo con el acceso retirado NO cuenta como segunda dueña', async () => {
    const g = await nuevoGimnasio('CasoC');
    const relevo = await segundaDuena(g.token, g.gymId, 'relevo-c');

    // Con el relevo vivo, puede.
    const conRelevo = await http().get('/v1/me/erasure-preview').set(conSesion(g.token)).expect(200);
    expect(conRelevo.body.puedeBorrarse).toBe(true);

    // Se le retira el acceso: la pertenencia queda TERMINADA, no borrada.
    const idRelevo = (
      await owner.execute<{ id: string }>(sql`SELECT id FROM users WHERE email = ${relevo.email}`)
    ).rows[0]!.id;
    await http().delete(`/v1/gyms/${g.gymId}/staff/${idRelevo}`).set(conSesion(g.token)).expect(200);

    /*
     * Y ahora NO puede. Es la mitad que hace que la anterior signifique algo:
     * sin ella, un gate que contara tambien las pertenencias terminadas daria
     * verde en los dos casos y nadie lo notaria.
     */
    const sinRelevo = await http().get('/v1/me/erasure-preview').set(conSesion(g.token)).expect(200);
    expect(sinRelevo.body.puedeBorrarse, 'una pertenencia terminada no es un relevo').toBe(false);
    expect(sinRelevo.body.bloqueos[0].gymId).toBe(g.gymId);
  });

  it('D · un solo gimnasio sin relevo bloquea el borrado GLOBAL entero', async () => {
    const conRelevo = await nuevoGimnasio('CasoD1');
    const sinRelevo = await nuevoGimnasio('CasoD2');

    await http()
      .post(`/v1/gyms/${sinRelevo.gymId}/invitations`)
      .set(conSesion(sinRelevo.token))
      .send({ email: correo('owner-casod1'), role: 'owner' })
      .expect(201);
    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(conRelevo.token))
      .send({ token: await tokenDeInvitacion(correo('owner-casod1')) })
      .expect(201);

    /*
     * Y la fundadora del segundo se va, para que ahi NO quede relevo. Sin este
     * paso el gimnasio conservaba a su fundadora como segunda dueña y el caso
     * no probaba nada: las dos mitades tenian relevo.
     */
    await http()
      .delete('/v1/me')
      .send({ password: PASSWORD })
      .set(conSesion(sinRelevo.token))
      .expect(200);

    // Relevo SOLO en el primero.
    await segundaDuena(conRelevo.token, conRelevo.gymId, 'relevo-d');

    const previo = await http()
      .get('/v1/me/erasure-preview')
      .set(conSesion(conRelevo.token))
      .expect(200);
    expect(previo.body.puedeBorrarse).toBe(false);
    expect(
      previo.body.bloqueos.map((b: { gymId: string }) => b.gymId),
      'sólo bloquea el que no tiene relevo, pero bloquea el borrado entero',
    ).toEqual([sinRelevo.gymId]);

    const borrado = await http()
      .delete('/v1/me')
      .send({ password: PASSWORD })
      .set(conSesion(conRelevo.token))
      .expect(200);
    expect(borrado.body.ok).toBe(false);
    expect(await existeUsuario(correo('owner-casod1'))).toBe(true);
  });
});

describe('un gimnasio nunca se queda sin dueña, venga de donde venga', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ DOS CAMINOS PUEDEN QUITARLE EL PUESTO A UNA DUEÑA, Y CADA UNO TIENE  │
   * │ SU GUARDA. NO ES EL MISMO GATE DUPLICADO.                            │
   * │                                                                      │
   * │   · retirar el acceso  — lo hace OTRA persona, y la guarda es «nadie │
   * │     puede retirarse a si mismo». Con ella, el ultimo que quede no    │
   * │     puede irse: no hace falta contar dueñas.                         │
   * │                                                                      │
   * │   · borrar la cuenta   — lo hace UNA MISMA, y ahi la guarda anterior │
   * │     no sirve: precisamente se esta yendo. Hace falta contar si queda │
   * │     relevo, que es lo que hace `bloqueos()`.                          │
   * │                                                                      │
   * │ Y hay un tercer camino que PARECE peligroso y no lo es: borrar la    │
   * │ FICHA DE SOCIA de una dueña. Se comprueba abajo.                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('retirar el acceso: nadie puede retirárselo a sí mismo', async () => {
    const g = await nuevoGimnasio('UltimaDuena');
    const id = (
      await owner.execute<{ id: string }>(
        sql`SELECT id FROM users WHERE email = ${correo('owner-ultimaduena')}`,
      )
    ).rows[0]!.id;

    await http().delete(`/v1/gyms/${g.gymId}/staff/${id}`).set(conSesion(g.token)).expect(400);

    const duenas = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM memberships
          WHERE gym_id = ${g.gymId}::uuid AND role = 'owner' AND ended_at IS NULL`,
    );
    expect(duenas.rows[0]!.n, 'el gimnasio conserva a su dueña').toBe(1);
  });

  it('borrar la ficha de socia de una dueña no le quita el puesto', async () => {
    /*
     * Una dueña puede ser ademas socia de su propio gimnasio. Si borrar su
     * ficha arrastrara la pertenencia de DUEÑA —o la cuenta entera—, el
     * gimnasio se quedaria sin nadie sin que ninguna guarda se enterara,
     * porque este camino no pasa por ninguna de las dos.
     *
     * No pasa: `IdentityErasure` retira solo la pertenencia de rol `member`,
     * y solo borra la cuenta si no le queda NINGUNA pertenencia.
     */
    const g = await nuevoGimnasio('DuenaSocia');
    const email = correo('owner-duenasocia');

    const idDuena = (
      await owner.execute<{ id: string }>(sql`SELECT id FROM users WHERE email = ${email}`)
    ).rows[0]!.id;

    // Se le da ficha de socia en su propio gimnasio y se vincula a su cuenta.
    const alta = await http()
      .post(`/v1/gyms/${g.gymId}/members`)
      .set(conSesion(g.token))
      .send({ firstName: 'Dueña', lastName: 'Socia', email: correo('ficha-duena') })
      .expect(201);
    await owner.execute(
      sql`UPDATE members SET user_id = ${idDuena}::uuid WHERE id = ${alta.body.id}::uuid`,
    );

    // Y el personal borra esa ficha.
    await http()
      .delete(`/v1/gyms/${g.gymId}/members/${alta.body.id}`)
      .set(conSesion(g.token))
      .expect(200);

    // La cuenta sigue, y sigue siendo dueña.
    expect(await existeUsuario(email)).toBe(true);
    const duenas = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM memberships
          WHERE gym_id = ${g.gymId}::uuid AND user_id = ${idDuena}::uuid
            AND role = 'owner' AND ended_at IS NULL`,
    );
    expect(duenas.rows[0]!.n, 'sigue siendo dueña').toBe(1);
    await http().get('/v1/auth/me').set(conSesion(g.token)).expect(200);
  });
});
