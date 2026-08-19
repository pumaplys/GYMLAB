/**
 * CICLOS DE VIDA: ARCHIVAR RUTINAS Y RETIRAR ACCESO A UN ENTRENADOR
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS DOS COSAS QUE SE PRUEBAN AQUI SON LO MISMO: NO PERDER LA HISTORIA.  │
 * │                                                                          │
 * │ Borrar una rutina cascadeaba `routine_assignments` y con ellas el        │
 * │ registro de que un socio la siguio. Y retirarle el acceso a un entrenador│
 * │ dejaba su perfil `active` con socios asignados que ya no podia atender.  │
 * │                                                                          │
 * │ Lo primero destruia historia; lo segundo mentia sobre el presente.       │
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
import { env } from '../config/env';

let app: INestApplication;
let owner: Database;
let http: () => request.Agent;

const sufijo = randomUUID().slice(0, 8);
const email = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const gimnasiosCreados: string[] = [];
const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

let gym: string;
let tokenOwner: string;
let tokenEntrenador: string;
let entrenadorUserId: string;
let entrenadorId: string;
let socio: string;
let ejercicio: string;

beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 3 });

  const alta = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: 'Ciclos',
      gymName: 'Ciclos',
      ownerName: 'Duena',
      email: email('duena'),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  gym = alta.body.activeGymId;
  tokenOwner = alta.body.token;
  gimnasiosCreados.push(gym);

  tokenEntrenador = await invitar('trainer', 'entrenador');
  const cuenta = await owner.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${email('entrenador')}`,
  );
  entrenadorUserId = cuenta.rows[0]!.id;
  const perfil = await owner.execute<{ id: string }>(
    sql`SELECT id FROM trainers WHERE gym_id = ${gym}::uuid AND user_id = ${entrenadorUserId}::uuid`,
  );
  entrenadorId = perfil.rows[0]!.id;

  socio = (
    await http()
      .post(`/v1/gyms/${gym}/members`)
      .set(conSesion(tokenOwner))
      .send({ firstName: 'Ana', lastName: 'Ciclos' })
      .expect(201)
  ).body.id;

  ejercicio = (
    await http()
      .post(`/v1/gyms/${gym}/exercises`)
      .set(conSesion(tokenOwner))
      .send({ name: `Ejercicio ${sufijo}`, muscleGroup: 'core' })
      .expect(201)
  ).body.id;
}, 120_000);

afterAll(async () => {
  if (gimnasiosCreados.length > 0) {
    const ids = sql.join(
      gimnasiosCreados.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const orgIds = sql`SELECT organization_id FROM gyms WHERE id IN (${ids})`;
    await owner.execute(sql`DELETE FROM gyms WHERE id IN (${ids})`);
    await owner.execute(sql`DELETE FROM organizations WHERE id IN (${orgIds})`);
  }
  await closeDatabase(owner);
  await app.close();
});

async function invitar(rol: string, quien: string): Promise<string> {
  await http()
    .post(`/v1/gyms/${gym}/invitations`)
    .set(conSesion(tokenOwner))
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

const crearRutina = (token: string, nombre: string) =>
  http()
    .post(`/v1/gyms/${gym}/routines`)
    .set(conSesion(token))
    .send({ name: nombre, items: [{ exerciseId: ejercicio, sets: 3, reps: '10' }] });

// ---------------------------------------------------------------- RUTINAS

describe('rutinas: archivar conserva, borrar casi nunca', () => {
  it('una rutina nace activa', async () => {
    const res = await crearRutina(tokenOwner, `Nace activa ${sufijo}`).expect(201);
    expect(res.body.status).toBe('active');
  });

  it('archivar la retira del uso SIN tocar su historia', async () => {
    const rutina = (await crearRutina(tokenOwner, `Con historia ${sufijo}`).expect(201)).body.id;
    await http()
      .post(`/v1/gyms/${gym}/routines/${rutina}/members`)
      .set(conSesion(tokenOwner))
      .send({ memberId: socio })
      .expect(201);

    const archivada = await http()
      .post(`/v1/gyms/${gym}/routines/${rutina}/archive`)
      .set(conSesion(tokenOwner))
      .expect(201);
    expect(archivada.body.status).toBe('archived');

    // Sus ejercicios y su asignacion siguen ahi: archivar no borra nada.
    expect(archivada.body.items).toHaveLength(1);
    const asignaciones = await owner.execute<{ n: string }>(
      sql`SELECT count(1)::text AS n FROM routine_assignments WHERE routine_id = ${rutina}::uuid`,
    );
    expect(asignaciones.rows[0]!.n).toBe('1');
  });

  it('una rutina archivada NO admite asignaciones nuevas', async () => {
    const rutina = (await crearRutina(tokenOwner, `Archivada ${sufijo}`).expect(201)).body.id;
    await http()
      .post(`/v1/gyms/${gym}/routines/${rutina}/archive`)
      .set(conSesion(tokenOwner))
      .expect(201);

    const otro = (
      await http()
        .post(`/v1/gyms/${gym}/members`)
        .set(conSesion(tokenOwner))
        .send({ firstName: 'Otro', lastName: 'Socio' })
        .expect(201)
    ).body.id;

    // Lo rechaza el SERVICIO. Si solo lo escondiera la pantalla, seguiria
    // siendo asignable por API y «archivada» no significaria nada.
    const res = await http()
      .post(`/v1/gyms/${gym}/routines/${rutina}/members`)
      .set(conSesion(tokenOwner))
      .send({ memberId: otro })
      .expect(400);
    expect(res.body.message).toMatch(/archivada/i);
  });

  it('archivar dos veces da 400, no un exito silencioso', async () => {
    const rutina = (await crearRutina(tokenOwner, `Doble ${sufijo}`).expect(201)).body.id;
    await http()
      .post(`/v1/gyms/${gym}/routines/${rutina}/archive`)
      .set(conSesion(tokenOwner))
      .expect(201);
    await http()
      .post(`/v1/gyms/${gym}/routines/${rutina}/archive`)
      .set(conSesion(tokenOwner))
      .expect(400);
  });

  it('NO hay forma de desarchivar en V1', async () => {
    const rutina = (await crearRutina(tokenOwner, `Sin vuelta ${sufijo}`).expect(201)).body.id;
    await http()
      .post(`/v1/gyms/${gym}/routines/${rutina}/archive`)
      .set(conSesion(tokenOwner))
      .expect(201);

    // Ni endpoint dedicado ni por la puerta de atras del editor.
    await http()
      .post(`/v1/gyms/${gym}/routines/${rutina}/unarchive`)
      .set(conSesion(tokenOwner))
      .expect(404);

    const sigue = await http()
      .get(`/v1/gyms/${gym}/routines/${rutina}`)
      .set(conSesion(tokenOwner))
      .expect(200);
    expect(sigue.body.status).toBe('archived');
  });

  it('el entrenador archiva LAS SUYAS', async () => {
    const suya = (await crearRutina(tokenEntrenador, `Del entrenador ${sufijo}`).expect(201)).body
      .id;

    const res = await http()
      .post(`/v1/gyms/${gym}/routines/${suya}/archive`)
      .set(conSesion(tokenEntrenador))
      .expect(201);
    expect(res.body.status).toBe('archived');
  });

  it('el entrenador NO archiva las de otro', async () => {
    // Puede haber socios de otro entrenador siguiendola.
    const ajena = (await crearRutina(tokenOwner, `De la duena ${sufijo}`).expect(201)).body.id;

    await http()
      .post(`/v1/gyms/${gym}/routines/${ajena}/archive`)
      .set(conSesion(tokenEntrenador))
      .expect(403);
  });

  it('el entrenador NO puede borrar, ni siquiera las suyas', async () => {
    const suya = (await crearRutina(tokenEntrenador, `Suya sin borrar ${sufijo}`).expect(201)).body
      .id;

    const res = await http()
      .delete(`/v1/gyms/${gym}/routines/${suya}`)
      .set(conSesion(tokenEntrenador))
      .expect(403);
    expect(res.body.message).toMatch(/archival|dueno/i);
  });

  it('la duena SI borra una rutina que nunca se asigno', async () => {
    const virgen = (await crearRutina(tokenOwner, `Creada por error ${sufijo}`).expect(201)).body.id;

    await http()
      .delete(`/v1/gyms/${gym}/routines/${virgen}`)
      .set(conSesion(tokenOwner))
      .expect(200);

    await http()
      .get(`/v1/gyms/${gym}/routines/${virgen}`)
      .set(conSesion(tokenOwner))
      .expect(404);
  });

  it('la duena NO borra una que tuvo asignaciones, aunque ya terminaran', async () => {
    /*
     * El caso que motiva todo: una asignacion TERMINADA sigue siendo historia.
     * Si el borrado la aceptara, cascadearia esa fila y el socio perderia el
     * registro de haber seguido esta rutina.
     */
    const usada = (await crearRutina(tokenOwner, `Usada ${sufijo}`).expect(201)).body.id;
    await http()
      .post(`/v1/gyms/${gym}/routines/${usada}/members`)
      .set(conSesion(tokenOwner))
      .send({ memberId: socio })
      .expect(201);
    await http()
      .delete(`/v1/gyms/${gym}/routines/${usada}/members/${socio}`)
      .set(conSesion(tokenOwner))
      .expect(200);

    const res = await http()
      .delete(`/v1/gyms/${gym}/routines/${usada}`)
      .set(conSesion(tokenOwner))
      .expect(400);
    expect(res.body.message).toMatch(/archivala|historial/i);

    // Y la asignacion terminada sigue en su sitio.
    const quedan = await owner.execute<{ n: string }>(
      sql`SELECT count(1)::text AS n FROM routine_assignments WHERE routine_id = ${usada}::uuid`,
    );
    expect(quedan.rows[0]!.n).toBe('1');
  });

  it('el listado distingue activas de archivadas', async () => {
    const lista = await http()
      .get(`/v1/gyms/${gym}/routines`)
      .set(conSesion(tokenOwner))
      .expect(200);

    // Las archivadas NO desaparecen del listado: quien las busca tiene que
    // poder verlas, marcadas.
    const estados = new Set(lista.body.map((r: { status: string }) => r.status));
    expect(estados.has('active')).toBe(true);
    expect(estados.has('archived')).toBe(true);
  });
});

// -------------------------------------------------------------- ENTRENADOR

describe('retirar acceso a un entrenador lo cierra entero', () => {
  it('termina pertenencia, perfil y asignaciones vigentes, y audita', async () => {
    await http()
      .post(`/v1/gyms/${gym}/trainers/${entrenadorId}/members`)
      .set(conSesion(tokenOwner))
      .send({ memberId: socio })
      .expect(201);

    const antes = await owner.execute<{ n: string }>(
      sql`SELECT count(1)::text AS n FROM trainer_assignments
          WHERE trainer_id = ${entrenadorId}::uuid AND ended_at IS NULL`,
    );
    expect(antes.rows[0]!.n).toBe('1');

    await http()
      .delete(`/v1/gyms/${gym}/staff/${entrenadorUserId}`)
      .set(conSesion(tokenOwner))
      .expect(200);

    const estado = await owner.execute<{
      pertenencia: string | null;
      perfil: string;
      vigentes: string;
      historicas: string;
    }>(sql`
      SELECT
        (SELECT ended_at::text FROM memberships
          WHERE gym_id = ${gym}::uuid AND user_id = ${entrenadorUserId}::uuid
          ORDER BY created_at DESC LIMIT 1) AS pertenencia,
        (SELECT status FROM trainers WHERE id = ${entrenadorId}::uuid) AS perfil,
        (SELECT count(1)::text FROM trainer_assignments
          WHERE trainer_id = ${entrenadorId}::uuid AND ended_at IS NULL) AS vigentes,
        (SELECT count(1)::text FROM trainer_assignments
          WHERE trainer_id = ${entrenadorId}::uuid) AS historicas
    `);

    const fila = estado.rows[0]!;
    expect(fila.pertenencia).not.toBeNull();
    expect(fila.perfil).toBe('inactive');
    expect(fila.vigentes).toBe('0');
    // La fila NO se borra: queda con su `ended_at`.
    expect(fila.historicas).toBe('1');

    const auditoria = await owner.execute<{ action: string; metadata: unknown }>(
      sql`SELECT action, metadata FROM audit_log
          WHERE gym_id = ${gym}::uuid AND entity_id = ${entrenadorId}::uuid
          ORDER BY created_at DESC LIMIT 1`,
    );
    expect(auditoria.rows[0]!.action).toBe('trainer.deactivated');
    expect(auditoria.rows[0]!.metadata).toMatchObject({
      asignacionesTerminadas: 1,
      porRevocacion: true,
    });
  });

  it('un entrenador de baja NO puede recibir socios nuevos', async () => {
    const res = await http()
      .post(`/v1/gyms/${gym}/trainers/${entrenadorId}/members`)
      .set(conSesion(tokenOwner))
      .send({ memberId: socio })
      .expect(400);
    expect(res.body.message).toMatch(/baja/i);
  });

  it('pero SIGUE saliendo en el listado administrativo, con su estado', async () => {
    /*
     * Esconderlo seria peor: quien mira el personal necesita entender el
     * pasado, y un entrenador que desaparece de la lista parece un error de
     * carga. Sale, marcado como inactivo.
     */
    const lista = await http()
      .get(`/v1/gyms/${gym}/trainers`)
      .set(conSesion(tokenOwner))
      .expect(200);

    const suyo = lista.body.find((t: { id: string }) => t.id === entrenadorId);
    expect(suyo).toBeDefined();
    expect(suyo.status).toBe('inactive');
  });

  it('reinvitar lo devuelve a activo, SIN recuperar su cartera', async () => {
    /*
     * Quien vuelve YA TIENE CUENTA, asi que el camino es `link-invitation`, que
     * exige sesion iniciada: el cuerpo solo lleva el token y la identidad sale
     * de la sesion, no del correo. Por eso hace falta volver a entrar primero
     * —perdio el acceso al gimnasio, no la cuenta—.
     */
    await http()
      .post(`/v1/gyms/${gym}/invitations`)
      .set(conSesion(tokenOwner))
      .send({ email: email('entrenador'), role: 'trainer' })
      .expect(201);

    const suSesion = (
      await http()
        .post('/v1/auth/login')
        .send({ email: email('entrenador'), password: PASSWORD })
        .expect(201)
    ).body.token as string;

    const job = await owner.execute<{ data: { token: string } }>(
      sql`SELECT data FROM pgboss.job WHERE name = ${EMAIL_QUEUES.invitation}
          AND data->>'to' = ${email('entrenador')} ORDER BY created_on DESC LIMIT 1`,
    );
    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(suSesion))
      .send({ token: job.rows[0]!.data.token })
      .expect(201);

    const despues = await owner.execute<{ perfil: string; vigentes: string }>(sql`
      SELECT
        (SELECT status FROM trainers WHERE id = ${entrenadorId}::uuid) AS perfil,
        (SELECT count(1)::text FROM trainer_assignments
          WHERE trainer_id = ${entrenadorId}::uuid AND ended_at IS NULL) AS vigentes
    `);

    expect(despues.rows[0]!.perfil).toBe('active');
    // Las antiguas NO vuelven: reasignar es una decision, no un efecto.
    expect(despues.rows[0]!.vigentes).toBe('0');
  });

  it('y ya puede recibir socios otra vez', async () => {
    await http()
      .post(`/v1/gyms/${gym}/trainers/${entrenadorId}/members`)
      .set(conSesion(tokenOwner))
      .send({ memberId: socio })
      .expect(201);
  });
});
