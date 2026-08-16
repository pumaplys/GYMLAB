/**
 * TESTS FUNCIONALES DE EJERCICIOS Y RUTINAS
 *
 * Dos focos:
 *   - ADR-0012: la biblioteca se COPIA. Lo que un gimnasio haga con la suya no
 *     puede tocar la de otro, y borrar un ejercicio no puede romper rutinas.
 *   - Autorizacion: un entrenador solo asigna rutinas a SUS socios, reutilizando
 *     el filtro del modulo 2.
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
let tokenEntrenador1: string;
let entrenador1: string;
let entrenador2: string;
let gymB: string;
let tokenOwnerB: string;
/** Cuantos ejercicios trae la plantilla de plataforma. */
let plantilla: number;

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

async function unEjercicio(gymId: string, token: string): Promise<string> {
  const lista = await http()
    .get(`/v1/gyms/${gymId}/exercises`)
    .set(conSesion(token))
    .expect(200);
  return lista.body[0].id as string;
}

async function crearRutina(gymId: string, token: string, nombre: string, ejercicioId: string) {
  const res = await http()
    .post(`/v1/gyms/${gymId}/routines`)
    .set(conSesion(token))
    .send({
      name: nombre,
      items: [{ exerciseId: ejercicioId, sets: 4, reps: '8-10', restSeconds: 90 }],
    })
    .expect(201);
  return res.body;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 3 });

  const conteo = await owner.execute<{ n: string }>(
    sql`SELECT count(*) AS n FROM exercise_templates`,
  );
  plantilla = Number(conteo.rows[0]!.n);

  const a = await registrarGimnasio('Gym A', 'owner-a');
  tokenOwnerA = a.token;
  gymA = a.gymId;
  const b = await registrarGimnasio('Gym B', 'owner-b');
  tokenOwnerB = b.token;
  gymB = b.gymId;

  tokenRecepcionA = await altaPersonal(gymA, tokenOwnerA, 'receptionist', 'recepcion-a');
  tokenEntrenador1 = await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-1');
  // El segundo entrenador existe para tener socios AJENOS a los que el primero
  // no debe poder llegar. Su sesion no hace falta: lo que se prueba es lo que
  // NO puede hacer el primero.
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

describe('la biblioteca se copia al crear el gimnasio (ADR-0012)', () => {
  it('un gimnasio nuevo nace con su lista puesta, sin que nadie la escriba', async () => {
    // Es la razon de ser de la decision: sin esto, el modulo de rutinas no sirve
    // hasta que alguien teclee doscientos ejercicios.
    const lista = await http()
      .get(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(lista.body).toHaveLength(plantilla);
    expect(plantilla).toBeGreaterThan(60);
    expect(lista.body.every((e: { fromTemplate: boolean }) => e.fromTemplate)).toBe(true);
  });

  it('lo que un gimnasio hace con SU copia no toca la del otro', async () => {
    // EL TEST QUE DEFIENDE LA DECISION. Si algun dia se compartieran filas, aqui
    // se veria: renombrar en A cambiaria el nombre en B.
    //
    // Al intentar falsificarlo quitando el `WHERE gym_id` del servicio, este test
    // SIGUIO PASANDO — y esta bien que asi sea: quien aisla de verdad es RLS, no
    // ese filtro. El `WHERE` se mantiene como segunda barrera, igual que en el
    // resto del proyecto, pero conviene saber donde vive la garantia: si algun
    // dia alguien tocara la politica de `exercises`, esto se pondria en rojo.
    const enA = await http()
      .get(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    const prensaA = enA.body.find((e: { name: string }) => e.name === 'Prensa de piernas');

    await http()
      .patch(`/v1/gyms/${gymA}/exercises/${prensaA.id}`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Prensa Hammer (la nuestra)' })
      .expect(200);

    const enB = await http()
      .get(`/v1/gyms/${gymB}/exercises`)
      .set(conSesion(tokenOwnerB))
      .expect(200);

    expect(enB.body.some((e: { name: string }) => e.name === 'Prensa de piernas')).toBe(true);
    expect(enB.body.some((e: { name: string }) => e.name.includes('Hammer'))).toBe(false);
  });

  it('borrar un ejercicio en A no lo borra en B', async () => {
    const enA = await http()
      .get(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    const comba = enA.body.find((e: { name: string }) => e.name === 'Comba');

    await http()
      .delete(`/v1/gyms/${gymA}/exercises/${comba.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const enB = await http()
      .get(`/v1/gyms/${gymB}/exercises`)
      .set(conSesion(tokenOwnerB))
      .expect(200);
    expect(enB.body.some((e: { name: string }) => e.name === 'Comba')).toBe(true);
  });

  it('el gimnasio puede anadir ejercicios propios', async () => {
    const res = await http()
      .post(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenEntrenador1))
      .send({ name: 'Trineo del pasillo', muscleGroup: 'full_body', equipment: 'Trineo' })
      .expect(201);

    expect(res.body.fromTemplate).toBe(false);
  });

  it('un nombre repetido da 400 con mensaje, nunca un 500', async () => {
    // Salio en la revision: el indice unico hacia su trabajo, pero la violacion
    // subia sin capturar y el panel recibia un 500 que no explica nada.
    // Renombrar la copia es de lo primero que hace un gimnasio (ADR-0012), asi
    // que el choque iba a pasar.
    const crear = await http()
      .post(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Sentadilla', muscleGroup: 'legs' })
      .expect(400);
    expect(crear.body.message).toMatch(/ya hay un ejercicio/i);

    const lista = await http()
      .get(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    const otro = lista.body.find((e: { name: string }) => e.name === 'Dominadas');

    await http()
      .patch(`/v1/gyms/${gymA}/exercises/${otro.id}`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Sentadilla' })
      .expect(400);

    // Y renombrarse a si mismo con el mismo nombre no es un choque.
    await http()
      .patch(`/v1/gyms/${gymA}/exercises/${otro.id}`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Dominadas', equipment: 'Barra fija' })
      .expect(200);
  });

  it('el catalogo de plataforma NO es escribible desde la aplicacion', async () => {
    // Es dato de referencia compartido: un gimnasio no puede tocarlo.
    const appDb = createDatabase({ connectionString: process.env.DATABASE_URL_APP!, max: 1 });
    try {
      let motivo = 'NO FALLO';
      try {
        await appDb.execute(
          sql`INSERT INTO exercise_templates (name, muscle_group) VALUES ('Colado', 'core')`,
        );
      } catch (e) {
        motivo = String((e as { cause?: unknown }).cause ?? e);
      }
      expect(motivo).toMatch(/permission denied/i);
    } finally {
      await closeDatabase(appDb);
    }
  });
});

describe('borrar un ejercicio no rompe las rutinas', () => {
  it('la rutina conserva el nombre copiado', async () => {
    // La promesa de ADR-0012: el gimnasio borra lo que quiere. Sin la copia del
    // nombre, la rutina quedaria con un hueco imposible de explicar.
    const propio = await http()
      .post(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Maquina rara', muscleGroup: 'legs' })
      .expect(201);

    const rutina = await crearRutina(gymA, tokenOwnerA, 'Con maquina rara', propio.body.id);
    expect(rutina.items[0].exerciseName).toBe('Maquina rara');

    await http()
      .delete(`/v1/gyms/${gymA}/exercises/${propio.body.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const tras = await http()
      .get(`/v1/gyms/${gymA}/routines/${rutina.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(tras.body.items).toHaveLength(1);
    expect(tras.body.items[0].exerciseName).toBe('Maquina rara');
    expect(tras.body.items[0].exerciseId).toBeNull();
    expect(tras.body.items[0].sets).toBe(4);
  });

  it('renombrar un ejercicio NO reescribe las rutinas ya creadas', async () => {
    // Lo que ya se prescribio no cambia porque alguien corrija el catalogo, con
    // el mismo criterio que hace que una suscripcion guarde el precio del plan.
    const ej = await http()
      .post(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Nombre viejo', muscleGroup: 'core' })
      .expect(201);
    const rutina = await crearRutina(gymA, tokenOwnerA, 'Con nombre viejo', ej.body.id);

    await http()
      .patch(`/v1/gyms/${gymA}/exercises/${ej.body.id}`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Nombre nuevo' })
      .expect(200);

    const tras = await http()
      .get(`/v1/gyms/${gymA}/routines/${rutina.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(tras.body.items[0].exerciseName).toBe('Nombre viejo');
  });
});

describe('un entrenador solo asigna rutinas a SUS socios', () => {
  it('asigna al suyo y el socio la ve', async () => {
    const mio = await altaSocio(gymA, tokenOwnerA, 'Mio');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador1}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: mio })
      .expect(201);

    const rutina = await crearRutina(
      gymA,
      tokenEntrenador1,
      'Fuerza principiantes',
      await unEjercicio(gymA, tokenEntrenador1),
    );

    await http()
      .post(`/v1/gyms/${gymA}/routines/${rutina.id}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: mio })
      .expect(201);

    const vistas = await http()
      .get(`/v1/gyms/${gymA}/members/${mio}/routines`)
      .set(conSesion(tokenEntrenador1))
      .expect(200);
    expect(vistas.body).toHaveLength(1);
    expect(vistas.body[0].items).toHaveLength(1);
  });

  it('NO puede asignar a un socio que no es suyo', async () => {
    // EL LIMITE DEL MODULO. Se apoya en el filtro del modulo de entrenadores en
    // lugar de reescribirlo: dos copias de una regla de autorizacion divergen, y
    // la que se olvide sera la insegura.
    const delCompanero = await altaSocio(gymA, tokenOwnerA, 'DelCompanero');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador2}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: delCompanero })
      .expect(201);

    const rutina = await crearRutina(
      gymA,
      tokenEntrenador1,
      'Ajena',
      await unEjercicio(gymA, tokenEntrenador1),
    );

    await http()
      .post(`/v1/gyms/${gymA}/routines/${rutina.id}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: delCompanero })
      .expect(404);
  });

  it('NO puede mirar las rutinas de un socio ajeno', async () => {
    const delCompanero = await altaSocio(gymA, tokenOwnerA, 'Ajeno2');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador2}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: delCompanero })
      .expect(201);

    await http()
      .get(`/v1/gyms/${gymA}/members/${delCompanero}/routines`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);
  });

  it('NO puede borrar la rutina de un companero, ni llevarse sus asignaciones', async () => {
    // HALLAZGO DE LA REVISION, comprobado antes ejecutando: un entrenador sin
    // relacion con nada de esto borraba la rutina de otro y la asignacion del
    // socio ajeno desaparecia por cascada. Irreversible y sobre gente que no era
    // suya. Compartir para leer y asignar si; para borrar no.
    const socioDeOtro = await altaSocio(gymA, tokenOwnerA, 'DeCompanero');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador2}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: socioDeOtro })
      .expect(201);

    // La rutina la crea el DUENO, asi que el entrenador 1 no es su creador.
    const ajena = await crearRutina(
      gymA,
      tokenOwnerA,
      'Del companero',
      await unEjercicio(gymA, tokenOwnerA),
    );
    await http()
      .post(`/v1/gyms/${gymA}/routines/${ajena.id}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: socioDeOtro })
      .expect(201);

    const res = await http()
      .delete(`/v1/gyms/${gymA}/routines/${ajena.id}`)
      .set(conSesion(tokenEntrenador1))
      .expect(403);
    expect(res.body.message).toMatch(/quien la creo/i);

    // Y la asignacion del socio ajeno sigue en pie.
    const sigue = await http()
      .get(`/v1/gyms/${gymA}/routines/${ajena.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(sigue.body.activeAssignments).toBe(1);
  });

  it('SI puede borrar la que creo el mismo', async () => {
    const propia = await crearRutina(
      gymA,
      tokenEntrenador1,
      'Mia propia',
      await unEjercicio(gymA, tokenEntrenador1),
    );

    await http()
      .delete(`/v1/gyms/${gymA}/routines/${propia.id}`)
      .set(conSesion(tokenEntrenador1))
      .expect(200);
  });

  it('el dueno puede borrar cualquiera', async () => {
    const deOtro = await crearRutina(
      gymA,
      tokenEntrenador1,
      'Del entrenador',
      await unEjercicio(gymA, tokenEntrenador1),
    );

    await http()
      .delete(`/v1/gyms/${gymA}/routines/${deOtro.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
  });

  it('el dueno si puede asignar a cualquiera', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'DelDueno');
    const rutina = await crearRutina(
      gymA,
      tokenOwnerA,
      'Del dueno',
      await unEjercicio(gymA, tokenOwnerA),
    );

    await http()
      .post(`/v1/gyms/${gymA}/routines/${rutina.id}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: socio })
      .expect(201);
  });

  it('al terminar la asignacion, deja de verla', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'Temporal');
    const rutina = await crearRutina(
      gymA,
      tokenOwnerA,
      'Temporal',
      await unEjercicio(gymA, tokenOwnerA),
    );
    await http()
      .post(`/v1/gyms/${gymA}/routines/${rutina.id}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: socio })
      .expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/routines/${rutina.id}/members/${socio}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const tras = await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/routines`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(tras.body).toHaveLength(0);
  });

  it('asignar dos veces la misma rutina responde 400', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'Doble');
    const rutina = await crearRutina(
      gymA,
      tokenOwnerA,
      'Doble',
      await unEjercicio(gymA, tokenOwnerA),
    );
    const asignar = () =>
      http()
        .post(`/v1/gyms/${gymA}/routines/${rutina.id}/members`)
        .set(conSesion(tokenOwnerA))
        .send({ memberId: socio });

    await asignar().expect(201);
    await asignar().expect(400);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ ASIGNAR UNA SEGUNDA RUTINA NO TERMINA LA PRIMERA.                        │
   * │                                                                          │
   * │ Se comprueba porque es exactamente lo contrario de lo que uno supondria  │
   * │ viniendo de "la rutina del socio": aqui se acumulan a proposito —fuerza  │
   * │ y movilidad— y la pantalla tiene que representar eso y no una sola.      │
   * │                                                                          │
   * │ Si alguien decidiera algun dia que solo puede haber una, este test se    │
   * │ pondria rojo, que es justo lo que se quiere: seria un cambio de producto │
   * │ y no un detalle de implementacion.                                       │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('asignar otra rutina NO reemplaza la anterior: se acumulan', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'Varias');
    const ejercicio = await unEjercicio(gymA, tokenOwnerA);
    const fuerza = await crearRutina(gymA, tokenOwnerA, 'Fuerza a la vez', ejercicio);
    const movilidad = await crearRutina(gymA, tokenOwnerA, 'Movilidad a la vez', ejercicio);

    for (const r of [fuerza, movilidad]) {
      await http()
        .post(`/v1/gyms/${gymA}/routines/${r.id}/members`)
        .set(conSesion(tokenOwnerA))
        .send({ memberId: socio })
        .expect(201);
    }

    const suyas = await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/routines`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(suyas.body).toHaveLength(2);
    // Y la mas reciente va primero: el servicio ordena por `assigned_at` desc.
    expect(suyas.body[0].name).toBe('Movilidad a la vez');
  });

  it('terminar una asignacion no toca las demas', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'Terminar');
    const ejercicio = await unEjercicio(gymA, tokenOwnerA);
    const una = await crearRutina(gymA, tokenOwnerA, 'Se queda', ejercicio);
    const otra = await crearRutina(gymA, tokenOwnerA, 'Se termina', ejercicio);

    for (const r of [una, otra]) {
      await http()
        .post(`/v1/gyms/${gymA}/routines/${r.id}/members`)
        .set(conSesion(tokenOwnerA))
        .send({ memberId: socio })
        .expect(201);
    }

    await http()
      .delete(`/v1/gyms/${gymA}/routines/${otra.id}/members/${socio}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const quedan = await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/routines`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(quedan.body.map((r: { name: string }) => r.name)).toEqual(['Se queda']);
  });

  it('terminar una que no sigue responde 404', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'NoSigue');
    const rutina = await crearRutina(
      gymA,
      tokenOwnerA,
      'Nunca asignada',
      await unEjercicio(gymA, tokenOwnerA),
    );

    await http()
      .delete(`/v1/gyms/${gymA}/routines/${rutina.id}/members/${socio}`)
      .set(conSesion(tokenOwnerA))
      .expect(404);
  });
});

/**
 * LO QUE NO SE PUEDE ASIGNAR, Y QUE CAPA LO IMPIDE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CADA FUGA LA CORTA UNA CAPA DISTINTA, Y CONVIENE SABER CUAL.             │
 * │                                                                          │
 * │   rutina de otro gimnasio  -> RLS. El SELECT no la ve, asi que           │
 * │                               `getRoutine` responde 404 "no existe".     │
 * │   socio de otro entrenador -> SERVICIO. RLS si deja verlo —es del mismo  │
 * │                               gimnasio— y lo que corta es `myMember`.    │
 * │   socio de otro gimnasio   -> LAS DOS. RLS lo esconde y el servicio      │
 * │                               tampoco lo encuentra entre los suyos.      │
 * │   gymId ajeno en la URL    -> CONTROLADOR, antes de tocar la base.       │
 * │                                                                          │
 * │ Importa porque si alguien quitara el filtro del servicio pensando que    │
 * │ "RLS ya lo cubre", el caso del companero quedaria abierto — y es el      │
 * │ unico de los cuatro que RLS no ve.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('lo que un entrenador no puede asignar', () => {
  it('una rutina que no existe: 404', async () => {
    const mio = await altaSocio(gymA, tokenOwnerA, 'ParaInexistente');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador1}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: mio })
      .expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/routines/${randomUUID()}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: mio })
      .expect(404);
  });

  it('una rutina de OTRO gimnasio: 404, como si no existiera', async () => {
    // La corta RLS: el SELECT de `getRoutine` no la ve, asi que para esta sesion
    // esa rutina no existe. Que responda 404 y no 403 es lo correcto —un 403
    // confirmaria que el identificador es de algo real.
    const ajena = await crearRutina(
      gymB,
      tokenOwnerB,
      'De otro gimnasio',
      await unEjercicio(gymB, tokenOwnerB),
    );

    const mio = await altaSocio(gymA, tokenOwnerA, 'ParaAjena');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador1}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: mio })
      .expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/routines/${ajena.id}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: mio })
      .expect(404);

    // Y sigue sin seguir nada.
    const suyas = await http()
      .get(`/v1/gyms/${gymA}/members/${mio}/routines`)
      .set(conSesion(tokenEntrenador1))
      .expect(200);
    expect(suyas.body).toHaveLength(0);
  });

  it('a un socio de OTRO gimnasio: 404', async () => {
    const deB = await altaSocio(gymB, tokenOwnerB, 'DelGimnasioB');
    const mia = await crearRutina(
      gymA,
      tokenEntrenador1,
      'Mia para B',
      await unEjercicio(gymA, tokenEntrenador1),
    );

    await http()
      .post(`/v1/gyms/${gymA}/routines/${mia.id}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: deB })
      .expect(404);
  });

  it('a un id de socio inventado: 404', async () => {
    const mia = await crearRutina(
      gymA,
      tokenEntrenador1,
      'Mia para nadie',
      await unEjercicio(gymA, tokenEntrenador1),
    );

    await http()
      .post(`/v1/gyms/${gymA}/routines/${mia.id}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: randomUUID() })
      .expect(404);
  });

  it('escribiendo el gymId de otro en la URL: 403, antes de tocar la base', async () => {
    const mia = await crearRutina(
      gymA,
      tokenEntrenador1,
      'Mia con gym ajeno',
      await unEjercicio(gymA, tokenEntrenador1),
    );
    const mio = await altaSocio(gymA, tokenOwnerA, 'ParaGymAjeno');

    await http()
      .post(`/v1/gyms/${gymB}/routines/${mia.id}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: mio })
      .expect(403);
  });

  it('un socio no puede asignarse rutinas a si mismo ni mirar las de otro', async () => {
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-sin-permiso');
    const mio = await altaSocio(gymA, tokenOwnerA, 'ParaSocio');
    const rutina = await crearRutina(
      gymA,
      tokenOwnerA,
      'Prohibida al socio',
      await unEjercicio(gymA, tokenOwnerA),
    );

    // `@Roles('owner', 'trainer')` en el controlador: no llega al servicio.
    await http()
      .post(`/v1/gyms/${gymA}/routines/${rutina.id}/members`)
      .set(conSesion(tokenSocio))
      .send({ memberId: mio })
      .expect(403);

    await http()
      .get(`/v1/gyms/${gymA}/members/${mio}/routines`)
      .set(conSesion(tokenSocio))
      .expect(403);
  });

  it('recepcion tampoco asigna', async () => {
    const mio = await altaSocio(gymA, tokenOwnerA, 'ParaRecepcion');
    const rutina = await crearRutina(
      gymA,
      tokenOwnerA,
      'Prohibida a recepcion',
      await unEjercicio(gymA, tokenOwnerA),
    );

    await http()
      .post(`/v1/gyms/${gymA}/routines/${rutina.id}/members`)
      .set(conSesion(tokenRecepcionA))
      .send({ memberId: mio })
      .expect(403);
  });
});

/**
 * CAMBIAR DE GIMNASIO NO ARRASTRA NADA DEL ANTERIOR.
 *
 * El mismo entrenador en dos gimnasios. Lo que se prueba no es que vea cosas
 * distintas —eso ya lo dan RLS y el contexto— sino que lo que tenia delante hace
 * un segundo deja de servirle: la rutina del gimnasio anterior no se puede
 * asignar, y su socio de alli ya no es suyo aqui.
 */
describe('un entrenador que cambia de gimnasio', () => {
  it('no puede usar la rutina ni el socio del gimnasio anterior', async () => {
    // Se le invita al gimnasio B con la cuenta que ya tiene: `link-invitation`,
    // no `accept-invitation`, que es para cuentas nuevas (ADR-0010).
    await http()
      .post(`/v1/gyms/${gymB}/invitations`)
      .set(conSesion(tokenOwnerB))
      .send({ email: email('entrenador-1'), role: 'trainer' })
      .expect(201);

    const job = await owner.execute<{ data: { token: string } }>(
      sql`SELECT data FROM pgboss.job WHERE name = ${EMAIL_QUEUES.invitation}
          AND data->>'to' = ${email('entrenador-1')} ORDER BY created_on DESC LIMIT 1`,
    );

    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(tokenEntrenador1))
      .send({ token: job.rows[0]!.data.token })
      .expect(201);

    // Lo que tenia en A antes de cambiar.
    const enA = await crearRutina(
      gymA,
      tokenEntrenador1,
      'Se queda en A',
      await unEjercicio(gymA, tokenEntrenador1),
    );
    const socioEnA = await altaSocio(gymA, tokenOwnerA, 'SoloEnA');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador1}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: socioEnA })
      .expect(201);

    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(tokenEntrenador1))
      .send({ gymId: gymB })
      .expect(201);

    // La rutina de A ya no existe para esta sesion.
    await http()
      .get(`/v1/gyms/${gymB}/routines/${enA.id}`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);

    // Y su listado de rutinas en B no la incluye.
    const enB = await http()
      .get(`/v1/gyms/${gymB}/routines`)
      .set(conSesion(tokenEntrenador1))
      .expect(200);
    expect(enB.body.map((r: { id: string }) => r.id)).not.toContain(enA.id);

    // Mandar la rutina de A escribiendo el gimnasio de A: 403 por el contexto.
    const socioEnB = await altaSocio(gymB, tokenOwnerB, 'EnB');
    await http()
      .post(`/v1/gyms/${gymA}/routines/${enA.id}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: socioEnB })
      .expect(403);

    // Y mandandola con el gimnasio activo correcto: 404, no existe aqui.
    await http()
      .post(`/v1/gyms/${gymB}/routines/${enA.id}/members`)
      .set(conSesion(tokenEntrenador1))
      .send({ memberId: socioEnB })
      .expect(404);

    // Su socio de A tampoco es suyo aqui.
    await http()
      .get(`/v1/gyms/${gymB}/members/${socioEnA}/routines`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);

    // Se vuelve a A para no dejar la sesion apuntando a B: los tests que siguen
    // usan este mismo token.
    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(tokenEntrenador1))
      .send({ gymId: gymA })
      .expect(201);
  });
});

describe('el socio y sus rutinas', () => {
  it('ve las suyas por /me/routines y no hay ruta para las de otro', async () => {
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-rutina');
    const yo = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('socio-rutina')}`,
    );
    const memberId = await altaSocio(gymA, tokenOwnerA, 'ConCuenta');
    await owner.execute(
      sql`UPDATE members SET user_id = ${yo.rows[0]!.id}::uuid WHERE id = ${memberId}::uuid`,
    );

    const rutina = await crearRutina(
      gymA,
      tokenOwnerA,
      'La suya',
      await unEjercicio(gymA, tokenOwnerA),
    );
    await http()
      .post(`/v1/gyms/${gymA}/routines/${rutina.id}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId })
      .expect(201);

    const mias = await http().get('/v1/me/routines').set(conSesion(tokenSocio)).expect(200);
    expect(mias.body).toHaveLength(1);
    expect(mias.body[0].name).toBe('La suya');

    // Y no puede entrar por la puerta del personal.
    await http()
      .get(`/v1/gyms/${gymA}/routines`)
      .set(conSesion(tokenSocio))
      .expect(403);
  });
});

describe('quien puede hacer que', () => {
  it('recepcion no toca ejercicios ni rutinas', async () => {
    // Quien decide como se entrena no es quien atiende el mostrador.
    await http().get(`/v1/gyms/${gymA}/exercises`).set(conSesion(tokenRecepcionA)).expect(403);
    await http().get(`/v1/gyms/${gymA}/routines`).set(conSesion(tokenRecepcionA)).expect(403);
  });

  it('no se puede meter en una rutina un ejercicio de OTRO gimnasio', async () => {
    const deB = await unEjercicio(gymB, tokenOwnerB);

    await http()
      .post(`/v1/gyms/${gymA}/routines`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Cruzada', items: [{ exerciseId: deB, sets: 3, reps: '10' }] })
      .expect(400);
  });

  it('escribir el gymId de A con sesion de B responde 403', async () => {
    await http().get(`/v1/gyms/${gymA}/routines`).set(conSesion(tokenOwnerB)).expect(403);
  });

  it('una rutina de A no es visible desde B', async () => {
    const rutina = await crearRutina(
      gymA,
      tokenOwnerA,
      'Solo de A',
      await unEjercicio(gymA, tokenOwnerA),
    );

    await http()
      .get(`/v1/gyms/${gymB}/routines/${rutina.id}`)
      .set(conSesion(tokenOwnerB))
      .expect(404);
  });
});

describe('edicion de rutinas', () => {
  it('editar reemplaza la lista entera y renumera las posiciones', async () => {
    const ejercicios = await http()
      .get(`/v1/gyms/${gymA}/exercises`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    const rutina = await crearRutina(gymA, tokenOwnerA, 'Editable', ejercicios.body[0].id);

    const res = await http()
      .patch(`/v1/gyms/${gymA}/routines/${rutina.id}`)
      .set(conSesion(tokenOwnerA))
      .send({
        items: [
          { exerciseId: ejercicios.body[1].id, sets: 3, reps: '12' },
          { exerciseId: ejercicios.body[2].id, sets: 5, reps: '5' },
        ],
      })
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((i: { position: number }) => i.position)).toEqual([1, 2]);
    expect(res.body.items[1].sets).toBe(5);
  });

  it('una rutina sin ejercicios no se acepta', async () => {
    await http()
      .post(`/v1/gyms/${gymA}/routines`)
      .set(conSesion(tokenOwnerA))
      .send({ name: 'Vacia', items: [] })
      .expect(400);
  });
});
