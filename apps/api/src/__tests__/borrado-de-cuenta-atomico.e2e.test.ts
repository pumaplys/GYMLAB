/**
 * QUE EL BORRADO DE CUENTA SEA TODO O NADA.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN BORRADO A MEDIAS ES PEOR QUE NO BORRAR.                              │
 * │                                                                          │
 * │ Si la operacion se cayera despues de eliminar las mediciones y antes de  │
 * │ eliminar la cuenta, quedaria una persona que sigue pudiendo entrar y ha  │
 * │ perdido sus datos sin haberlo pedido. Y al reves: una cuenta borrada con │
 * │ sus fichas vivas dejaria PII en varios gimnasios sin dueño.              │
 * │                                                                          │
 * │ Aqui se rompe la operacion A PROPOSITO en mitad del recorrido y se       │
 * │ comprueba que la base queda EXACTAMENTE como estaba.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El sabotaje se mete en el hook que dispara el borrado de la ficha, que es el
 * punto MAS profundo de la operacion: cuando salta, ya se ha escrito en
 * `audit_log`, ya se ha borrado la ficha y ya han caido sus cascadas.
 *
 * Con `explota` en `false` el mismo fichero prueba la otra mitad: que sin
 * romperlo la operacion SI cambia las cosas. Sin esa segunda mitad, una prueba
 * de «no cambio nada» pasaria igual si el endpoint no hiciera nada.
 *
 * Requiere:
 *   docker compose up -d
 *   pnpm db:migrate
 */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { closeDatabase, createDatabase, sql, type Database } from '@gymlab/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { IdentityErasure } from '../auth/identity-erasure';
import { MEMBER_ERASED_HOOK, type MemberErasedEvent } from '../common/member-erased-hooks';
import { env } from '../config/env';

let app: INestApplication;
let owner: Database;
let http: () => request.Agent;

let explota = true;
const real = new IdentityErasure();

const sufijo = randomUUID().slice(0, 8);
const correo = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

let gymId: string;
let tokenDuena: string;
let tokenSocia: string;
let emailSocia: string;
let memberId: string;

beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MEMBER_ERASED_HOOK)
    .useValue([
      {
        onMemberErased: async (evento: MemberErasedEvent) => {
          if (explota) throw new Error('sabotaje deliberado dentro del borrado');
          return real.onMemberErased(evento);
        },
      },
    ])
    .compile();

  app = modulo.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 3 });

  const alta = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: 'Atomico',
      gymName: 'Atomico',
      ownerName: 'Duena',
      email: correo('owner'),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  tokenDuena = alta.body.token;
  gymId = alta.body.activeGymId;

  emailSocia = correo('socia');
  const ficha = await http()
    .post(`/v1/gyms/${gymId}/members`)
    .set(conSesion(tokenDuena))
    .send({ firstName: 'Sara', lastName: 'Atomo', email: emailSocia })
    .expect(201);
  memberId = ficha.body.id;

  await http()
    .post(`/v1/gyms/${gymId}/members/${memberId}/invite`)
    .set(conSesion(tokenDuena))
    .expect(201);

  const token = (
    await owner.execute<{ token: string }>(
      sql`SELECT data->>'token' AS token FROM pgboss.job
          WHERE name = 'email.invitation' AND data->>'to' = ${emailSocia}
          ORDER BY created_on DESC LIMIT 1`,
    )
  ).rows[0]!.token;

  const sesion = await http()
    .post('/v1/auth/accept-invitation')
    .send({ token, name: 'Sara', password: PASSWORD })
    .expect(201);
  tokenSocia = sesion.body.token;

  // Un dato de cada clase, para poder comprobar que ninguna se mueve.
  await owner.execute(sql`
    INSERT INTO body_metrics (gym_id, member_id, measured_at, weight_kg, consent_version)
    VALUES (${gymId}::uuid, ${memberId}::uuid, now(), 61.0, 'v-atomica')`);
});

afterAll(async () => {
  await app?.close();
  if (!owner) return;
  const patron = `%-${sufijo}@test.local`;
  const orgs = await owner.execute<{ organization_id: string }>(
    sql`SELECT DISTINCT organization_id FROM gyms WHERE id = ${gymId}::uuid`,
  );
  await owner.execute(sql`DELETE FROM invitations WHERE gym_id = ${gymId}::uuid`);
  await owner.execute(sql`DELETE FROM audit_log WHERE gym_id = ${gymId}::uuid`);
  await owner.execute(sql`DELETE FROM memberships WHERE gym_id = ${gymId}::uuid`);
  await owner.execute(sql`DELETE FROM gyms WHERE id = ${gymId}::uuid`);
  if (orgs.rows.length > 0) {
    const ids = sql.raw(orgs.rows.map((o) => `'${o.organization_id}'::uuid`).join(','));
    await owner.execute(sql`DELETE FROM organizations WHERE id IN (${ids})`);
  }
  await owner.execute(sql`DELETE FROM auth_events WHERE email_attempted LIKE ${patron}`);
  await owner.execute(sql`DELETE FROM users WHERE email LIKE ${patron}`);
  await closeDatabase(owner);
});

/** Una foto de todo lo que el borrado tocaria. */
async function foto() {
  const r = await owner.execute<{
    usuarios: number;
    fichas: number;
    pertenencias: number;
    medidas: number;
    sesiones: number;
  }>(sql`
    SELECT (SELECT count(*) FROM users WHERE email = ${emailSocia})::int AS usuarios,
           (SELECT count(*) FROM members WHERE id = ${memberId}::uuid)::int AS fichas,
           (SELECT count(*) FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE u.email = ${emailSocia})::int AS pertenencias,
           (SELECT count(*) FROM body_metrics WHERE member_id = ${memberId}::uuid)::int AS medidas,
           (SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE u.email = ${emailSocia})::int AS sesiones`);
  return r.rows[0]!;
}

describe('si algo falla a mitad, no se borra nada', () => {
  it('un fallo dentro del borrado deja la base exactamente como estaba', async () => {
    explota = true;
    const antes = await foto();
    expect(antes.usuarios, 'la cuenta existe antes').toBe(1);
    expect(antes.medidas, 'y su medición también').toBe(1);

    await http()
      .delete('/v1/me')
      .send({ password: PASSWORD })
      .set(conSesion(tokenSocia))
      .expect(500);

    const despues = await foto();
    expect(despues, 'ni una fila distinta').toEqual(antes);

    // Y la sesión sigue sirviendo: no se ha quedado a medias.
    await http().get('/v1/auth/me').set(conSesion(tokenSocia)).expect(200);
  });

  it('y sin el sabotaje sí borra, que es lo que hace significativa a la anterior', async () => {
    explota = false;

    await http()
      .delete('/v1/me')
      .send({ password: PASSWORD })
      .set(conSesion(tokenSocia))
      .expect(200);

    const despues = await foto();
    expect(despues.usuarios).toBe(0);
    expect(despues.fichas).toBe(0);
    expect(despues.pertenencias).toBe(0);
    expect(despues.medidas).toBe(0);
    expect(despues.sesiones).toBe(0);

    await http().get('/v1/auth/me').set(conSesion(tokenSocia)).expect(401);
  });
});
