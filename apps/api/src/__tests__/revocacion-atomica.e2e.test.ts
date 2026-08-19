/**
 * RETIRAR EL ACCESO ES ATOMICO, O NO ES NADA
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO SE PUEDE PROBAR MIRANDO EL CODIGO.                               │
 * │                                                                          │
 * │ Que el `await hook.onAccessRevoked(...)` este escrito dentro del callback │
 * │ de la transaccion PARECE suficiente, pero no lo demuestra: basta con que  │
 * │ el hook abriera su propia conexion —en vez de usar la `tx` del evento—    │
 * │ para que su trabajo se confirmara aparte y sobreviviera al rollback. El   │
 * │ codigo se leeria igual de bien y el sistema quedaria a medias.            │
 * │                                                                          │
 * │ Aqui se rompe el hook a proposito y se comprueba lo unico que importa:    │
 * │ que despues del fallo NO queda nada a medias. Ni media baja, ni un perfil │
 * │ desactivado sin que la pertenencia se cerrara, ni asignaciones sueltas.   │
 * └──────────────────────────────────────────────────────────────────────────┘
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
import { ACCESS_REVOKED_HOOK, type AccessRevokedEvent } from '../common/access-revoked-hooks';
import { TrainerAccessRevoked } from '../trainers/trainer-access-revoked';
import { env } from '../config/env';

let app: INestApplication;
let owner: Database;
let http: () => request.Agent;

/**
 * El interruptor del sabotaje.
 *
 * Con `true` el hook explota; con `false` delega en el de verdad. Asi el mismo
 * fichero prueba las dos mitades: que romperlo deja la base intacta, y que sin
 * romperlo la operacion si cambia las tres cosas. Sin esa segunda mitad, una
 * prueba de "no cambio nada" pasaria igual si el endpoint no hiciera nada.
 */
let explota = true;
const real = new TrainerAccessRevoked();

const sufijo = randomUUID().slice(0, 8);
const email = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

let gym: string;
let tokenOwner: string;

beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ACCESS_REVOKED_HOOK)
    .useValue([
      {
        onAccessRevoked: async (evento: AccessRevokedEvent) => {
          if (explota) throw new Error('sabotaje deliberado dentro del hook');
          return real.onAccessRevoked(evento);
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
      organizationName: 'Atomica',
      gymName: 'Atomica',
      ownerName: 'Duena',
      email: email('duena'),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  gym = alta.body.activeGymId;
  tokenOwner = alta.body.token;
}, 120_000);

afterAll(async () => {
  const orgIds = sql`SELECT organization_id FROM gyms WHERE id = ${gym}::uuid`;
  await owner.execute(sql`DELETE FROM gyms WHERE id = ${gym}::uuid`);
  await owner.execute(sql`DELETE FROM organizations WHERE id IN (${orgIds})`);
  await closeDatabase(owner);
  await app.close();
});

/** Un entrenador nuevo con dos socios vigentes. Devuelve como mirarlo despues. */
async function unEntrenadorConCartera(quien: string) {
  await http()
    .post(`/v1/gyms/${gym}/invitations`)
    .set(conSesion(tokenOwner))
    .send({ email: email(quien), role: 'trainer' })
    .expect(201);

  const job = await owner.execute<{ data: { token: string } }>(
    sql`SELECT data FROM pgboss.job WHERE name = ${EMAIL_QUEUES.invitation}
        AND data->>'to' = ${email(quien)} ORDER BY created_on DESC LIMIT 1`,
  );
  await http()
    .post('/v1/auth/accept-invitation')
    .send({ token: job.rows[0]!.data.token, name: quien, password: PASSWORD })
    .expect(201);

  const cuenta = await owner.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${email(quien)}`,
  );
  const userId = cuenta.rows[0]!.id;
  const perfil = await owner.execute<{ id: string }>(
    sql`SELECT id FROM trainers WHERE gym_id = ${gym}::uuid AND user_id = ${userId}::uuid`,
  );
  const trainerId = perfil.rows[0]!.id;

  for (const nombre of ['Socia', 'Socio']) {
    const socio = (
      await http()
        .post(`/v1/gyms/${gym}/members`)
        .set(conSesion(tokenOwner))
        .send({ firstName: nombre, lastName: quien })
        .expect(201)
    ).body.id;
    await http()
      .post(`/v1/gyms/${gym}/trainers/${trainerId}/members`)
      .set(conSesion(tokenOwner))
      .send({ memberId: socio })
      .expect(201);
  }

  return { userId, trainerId };
}

/** Las tres cosas que la revocacion tiene que cambiar, leidas de golpe. */
async function estadoDe(userId: string, trainerId: string) {
  const res = await owner.execute<{
    membresia_abierta: string;
    perfil: string;
    vigentes: string;
  }>(sql`
    SELECT
      (SELECT count(1)::text FROM memberships
        WHERE gym_id = ${gym}::uuid AND user_id = ${userId}::uuid AND ended_at IS NULL)
        AS membresia_abierta,
      (SELECT status FROM trainers WHERE id = ${trainerId}::uuid) AS perfil,
      (SELECT count(1)::text FROM trainer_assignments
        WHERE trainer_id = ${trainerId}::uuid AND ended_at IS NULL) AS vigentes
  `);
  return res.rows[0]!;
}

describe('si el hook de desactivacion falla, no queda nada a medias', () => {
  it('el rollback deshace TAMBIEN lo que ya habia escrito la transaccion', async () => {
    explota = true;
    const { userId, trainerId } = await unEntrenadorConCartera('roto');

    const antes = await estadoDe(userId, trainerId);
    expect(antes).toEqual({ membresia_abierta: '1', perfil: 'active', vigentes: '2' });

    // El fallo del hook se propaga: la peticion no puede responder "hecho".
    await http()
      .delete(`/v1/gyms/${gym}/staff/${userId}`)
      .set(conSesion(tokenOwner))
      .expect((res) => {
        expect(res.status).toBeGreaterThanOrEqual(500);
      });

    /*
     * Lo importante no es que el perfil siga `active` —eso lo garantizaria
     * cualquier orden de ejecucion—, es que la MEMBRESIA siga abierta: se
     * cierra ANTES de llamar al hook, asi que si sobreviviera al fallo
     * tendriamos a alguien sin acceso al gimnasio y con la ficha diciendo que
     * sigue trabajando aqui.
     */
    expect(await estadoDe(userId, trainerId)).toEqual({
      membresia_abierta: '1',
      perfil: 'active',
      vigentes: '2',
    });

    // Y tampoco queda auditoria de una baja que no ocurrio.
    const auditoria = await owner.execute<{ n: string }>(sql`
      SELECT count(1)::text AS n FROM audit_log
       WHERE gym_id = ${gym}::uuid
         AND action IN ('membership.revoked', 'trainer.deactivated')
    `);
    expect(auditoria.rows[0]!.n).toBe('0');
  });

  it('y sin romperlo, esa misma llamada si cambia las tres cosas', async () => {
    /*
     * La otra mitad. Sin esto, la prueba de arriba pasaria igual de bien si el
     * endpoint no hiciera absolutamente nada, que es justo lo que no queremos
     * dar por bueno.
     */
    explota = false;
    const { userId, trainerId } = await unEntrenadorConCartera('sano');

    expect(await estadoDe(userId, trainerId)).toEqual({
      membresia_abierta: '1',
      perfil: 'active',
      vigentes: '2',
    });

    await http()
      .delete(`/v1/gyms/${gym}/staff/${userId}`)
      .set(conSesion(tokenOwner))
      .expect(200);

    expect(await estadoDe(userId, trainerId)).toEqual({
      membresia_abierta: '0',
      perfil: 'inactive',
      vigentes: '0',
    });
  });
});
