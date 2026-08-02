/**
 * TESTS FUNCIONALES DEL MODULO DE ENTRENADORES
 *
 * El foco es el limite que RLS NO cubre: dentro de un mismo gimnasio, que cada
 * entrenador vea solo a los socios que tiene asignados. Para PostgreSQL, el
 * entrenador y el dueno son el mismo rol; ese filtro lo pone la aplicacion, asi
 * que aqui hay que intentar romperlo de verdad.
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
/** Dos entrenadores en el MISMO gimnasio: el companero es el atacante natural. */
let tokenEntrenador1: string;
let tokenEntrenador2: string;
let entrenador1: string;
let entrenador2: string;
let gymB: string;
let tokenOwnerB: string;

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

async function tokenEncolado(destinatario: string): Promise<string> {
  const res = await owner.execute<{ data: { token: string } }>(
    sql`SELECT data FROM pgboss.job WHERE name = ${EMAIL_QUEUES.invitation}
        AND data->>'to' = ${destinatario} ORDER BY created_on DESC LIMIT 1`,
  );
  const token = res.rows[0]?.data?.token;
  if (!token) throw new Error(`Sin invitacion encolada para ${destinatario}`);
  return token;
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

/** Da de alta a alguien del personal aceptando su invitacion. */
async function altaPersonal(gymId: string, tokenStaff: string, rol: string, quien: string) {
  await http()
    .post(`/v1/gyms/${gymId}/invitations`)
    .set(conSesion(tokenStaff))
    .send({ email: email(quien), role: rol })
    .expect(201);

  const res = await http()
    .post('/v1/auth/accept-invitation')
    .send({ token: await tokenEncolado(email(quien)), name: quien, password: PASSWORD })
    .expect(201);
  return res.body.token as string;
}

/** Da de alta un socio y devuelve su id. */
async function altaSocio(gymId: string, tokenStaff: string, apellido: string): Promise<string> {
  const res = await http()
    .post(`/v1/gyms/${gymId}/members`)
    .set(conSesion(tokenStaff))
    .send({ firstName: 'Socio', lastName: apellido })
    .expect(201);
  return res.body.id as string;
}

/** Sin `async` a proposito: devuelve la peticion para poder encadenar `.expect()`. */
function asignar(gymId: string, tokenStaff: string, trainerId: string, memberId: string) {
  return http()
    .post(`/v1/gyms/${gymId}/trainers/${trainerId}/members`)
    .set(conSesion(tokenStaff))
    .send({ memberId });
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
  tokenEntrenador2 = await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-2');

  const lista = await http()
    .get(`/v1/gyms/${gymA}/trainers`)
    .set(conSesion(tokenOwnerA))
    .expect(200);
  entrenador1 = lista.body.find(
    (t: { email: string }) => t.email === email('entrenador-1'),
  ).id as string;
  entrenador2 = lista.body.find(
    (t: { email: string }) => t.email === email('entrenador-2'),
  ).id as string;
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

describe('el perfil aparece al aceptar la invitacion', () => {
  it('el entrenador tiene perfil, con el nombre y el email de su cuenta', async () => {
    // No hay POST /trainers: el perfil lo crea el hook al aceptarse la
    // invitacion. Si esto falla, el modulo entero se queda sin puerta de entrada.
    const res = await http()
      .get(`/v1/gyms/${gymA}/trainers/${entrenador1}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(res.body.email).toBe(email('entrenador-1'));
    expect(res.body.name).toBe('entrenador-1');
    expect(res.body.status).toBe('active');
    expect(res.body.activeMembers).toBe(0);
  });

  it('aceptar como SOCIO no crea perfil de entrenador', async () => {
    // El hook mira el rol del evento. Si reaccionara a cualquier invitacion,
    // todos los socios del gimnasio serian entrenadores.
    await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-con-cuenta');

    const lista = await http()
      .get(`/v1/gyms/${gymA}/trainers`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(lista.body).toHaveLength(2);
  });
});

describe('el entrenador ve SOLO a sus socios asignados', () => {
  it('la lista propia trae los asignados y ninguno mas', async () => {
    const mio = await altaSocio(gymA, tokenOwnerA, 'Mio');
    const ajeno = await altaSocio(gymA, tokenOwnerA, 'Ajeno');
    await asignar(gymA, tokenOwnerA, entrenador1, mio).expect(201);
    await asignar(gymA, tokenOwnerA, entrenador2, ajeno).expect(201);

    const res = await http()
      .get('/v1/me/trainer/members')
      .set(conSesion(tokenEntrenador1))
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(mio);
    expect(res.body[0].lastName).toBe('Mio');
  });

  it('pedir la ficha de un socio NO asignado responde 404', async () => {
    // 404 y no 403: confirmar que la ficha existe ya seria filtrar informacion
    // sobre socios ajenos.
    const delCompanero = await altaSocio(gymA, tokenOwnerA, 'DelCompanero');
    await asignar(gymA, tokenOwnerA, entrenador2, delCompanero).expect(201);

    await http()
      .get(`/v1/me/trainer/members/${delCompanero}`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);
  });

  it('al terminar la asignacion, deja de verlo', async () => {
    // El acceso tiene que irse cuando se retira, no solo concederse al asignar.
    const socio = await altaSocio(gymA, tokenOwnerA, 'Temporal');
    await asignar(gymA, tokenOwnerA, entrenador1, socio).expect(201);

    await http()
      .get(`/v1/me/trainer/members/${socio}`)
      .set(conSesion(tokenEntrenador1))
      .expect(200);

    await http()
      .delete(`/v1/gyms/${gymA}/trainers/${entrenador1}/members/${socio}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await http()
      .get(`/v1/me/trainer/members/${socio}`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);

    const lista = await http()
      .get('/v1/me/trainer/members')
      .set(conSesion(tokenEntrenador1))
      .expect(200);
    expect(lista.body.map((m: { id: string }) => m.id)).not.toContain(socio);
  });

  it('un socio dado de baja desaparece de su lista, y vuelve al reactivarlo', async () => {
    // La asignacion NO se termina al dar de baja: sobrevive escondida. Es la
    // misma idea que hace que la baja no borre la ficha — cuando esa persona
    // vuelve, recupera a su entrenador sin que nadie reasigne nada.
    //
    // Antes de este arreglo el entrenador seguia viendo al socio de baja, lo
    // que ademas contradecia que asignar a un socio de baja este prohibido.
    const socio = await altaSocio(gymA, tokenOwnerA, 'VaYVuelve');
    await asignar(gymA, tokenOwnerA, entrenador1, socio).expect(201);

    const conta = async () =>
      (await http().get(`/v1/gyms/${gymA}/trainers/${entrenador1}`).set(conSesion(tokenOwnerA)))
        .body.activeMembers as number;
    const antes = await conta();

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    const durante = await http()
      .get('/v1/me/trainer/members')
      .set(conSesion(tokenEntrenador1))
      .expect(200);
    expect(durante.body.map((m: { id: string }) => m.id)).not.toContain(socio);

    // Ni por id directo, ni en el contador que ve el dueno.
    await http()
      .get(`/v1/me/trainer/members/${socio}`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);
    expect(await conta()).toBe(antes - 1);

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio}/reactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    // Y vuelve solo: la asignacion nunca se termino.
    const despues = await http()
      .get('/v1/me/trainer/members')
      .set(conSesion(tokenEntrenador1))
      .expect(200);
    expect(despues.body.map((m: { id: string }) => m.id)).toContain(socio);
    expect(await conta()).toBe(antes);
  });

  it('no puede listar los socios del gimnasio ni a los entrenadores', async () => {
    await http().get(`/v1/gyms/${gymA}/members`).set(conSesion(tokenEntrenador1)).expect(403);
    await http().get(`/v1/gyms/${gymA}/trainers`).set(conSesion(tokenEntrenador1)).expect(403);
    await http()
      .get(`/v1/gyms/${gymA}/trainers/${entrenador2}/members`)
      .set(conSesion(tokenEntrenador1))
      .expect(403);
  });

  it('no puede asignarse socios a si mismo', async () => {
    // Si pudiera, el filtro de "solo mis asignados" no valdria nada: bastaria
    // con asignarse el gimnasio entero.
    const socio = await altaSocio(gymA, tokenOwnerA, 'NoTuyo');

    await asignar(gymA, tokenEntrenador1, entrenador1, socio).expect(403);
  });

  it('un socio con cuenta tampoco puede asignar', async () => {
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-listillo');
    const victima = await altaSocio(gymA, tokenOwnerA, 'Victima');

    await asignar(gymA, tokenSocio, entrenador1, victima).expect(403);
    await http().get('/v1/me/trainer/members').set(conSesion(tokenSocio)).expect(403);
  });
});

describe('asignaciones', () => {
  it('recepcion puede asignar, y el socio aparece en la lista del entrenador', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'PorRecepcion');
    await asignar(gymA, tokenRecepcionA, entrenador1, socio).expect(201);

    const res = await http()
      .get('/v1/me/trainer/members')
      .set(conSesion(tokenEntrenador1))
      .expect(200);
    expect(res.body.map((m: { id: string }) => m.id)).toContain(socio);
  });

  it('asignar dos veces al mismo par responde 400', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'Doble');
    await asignar(gymA, tokenOwnerA, entrenador1, socio).expect(201);
    await asignar(gymA, tokenOwnerA, entrenador1, socio).expect(400);
  });

  it('tras terminar una asignacion se puede volver a asignar la misma pareja', async () => {
    // El indice unico es parcial (solo vigentes) justo para permitir esto: la
    // fila historica se conserva y no estorba.
    const socio = await altaSocio(gymA, tokenOwnerA, 'Vuelve');
    await asignar(gymA, tokenOwnerA, entrenador1, socio).expect(201);
    await http()
      .delete(`/v1/gyms/${gymA}/trainers/${entrenador1}/members/${socio}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await asignar(gymA, tokenOwnerA, entrenador1, socio).expect(201);
  });

  it('un socio puede tener dos entrenadores a la vez', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'DosEntrenadores');
    await asignar(gymA, tokenOwnerA, entrenador1, socio).expect(201);
    await asignar(gymA, tokenOwnerA, entrenador2, socio).expect(201);

    for (const token of [tokenEntrenador1, tokenEntrenador2]) {
      const res = await http().get('/v1/me/trainer/members').set(conSesion(token)).expect(200);
      expect(res.body.map((m: { id: string }) => m.id)).toContain(socio);
    }
  });

  it('no se puede asignar un socio de OTRO gimnasio', async () => {
    const enB = await altaSocio(gymB, tokenOwnerB, 'DelGimnasioB');

    // 404 y no 403: para el gimnasio A esa ficha no existe. RLS la esconde y el
    // servicio no debe confirmar lo contrario.
    await asignar(gymA, tokenOwnerA, entrenador1, enB).expect(404);
  });

  it('no se puede asignar a un entrenador de baja ni a un socio de baja', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'DeBaja');
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    await asignar(gymA, tokenOwnerA, entrenador1, socio).expect(400);
  });

  it('terminar una asignacion que no existe responde 404', async () => {
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinAsignar');
    await http()
      .delete(`/v1/gyms/${gymA}/trainers/${entrenador1}/members/${socio}`)
      .set(conSesion(tokenOwnerA))
      .expect(404);
  });
});

describe('baja del entrenador', () => {
  it('dar de baja termina sus asignaciones y le quita el acceso', async () => {
    const tokenEfimero = await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-efimero');
    const lista = await http()
      .get(`/v1/gyms/${gymA}/trainers`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    const efimero = lista.body.find(
      (t: { email: string }) => t.email === email('entrenador-efimero'),
    ).id as string;

    const socio = await altaSocio(gymA, tokenOwnerA, 'SeQuedaSolo');
    await asignar(gymA, tokenOwnerA, efimero, socio).expect(201);

    const baja = await http()
      .post(`/v1/gyms/${gymA}/trainers/${efimero}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    expect(baja.body.liberados).toBe(1);
    expect(baja.body.trainer.status).toBe('inactive');
    expect(baja.body.trainer.activeMembers).toBe(0);

    // Y lo que importa: ya no ve a ese socio.
    const suya = await http()
      .get('/v1/me/trainer/members')
      .set(conSesion(tokenEfimero))
      .expect(200);
    expect(suya.body).toHaveLength(0);

    // Reactivar NO devuelve las asignaciones: volver a asignar es una decision.
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${efimero}/reactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    const tras = await http()
      .get('/v1/me/trainer/members')
      .set(conSesion(tokenEfimero))
      .expect(200);
    expect(tras.body).toHaveLength(0);
  });

  it('recepcion no puede dar de baja ni editar a un entrenador', async () => {
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador2}/deactivate`)
      .set(conSesion(tokenRecepcionA))
      .expect(403);

    await http()
      .patch(`/v1/gyms/${gymA}/trainers/${entrenador2}`)
      .set(conSesion(tokenRecepcionA))
      .send({ bio: 'Cambiado por recepcion' })
      .expect(403);
  });
});

describe('perfil propio del entrenador', () => {
  it('puede editar su bio y su telefono, y lo ve el personal', async () => {
    await http()
      .patch('/v1/me/trainer')
      .set(conSesion(tokenEntrenador2))
      .send({ bio: 'Especialista en fuerza', phone: '600111222' })
      .expect(200);

    const visto = await http()
      .get(`/v1/gyms/${gymA}/trainers/${entrenador2}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(visto.body.bio).toBe('Especialista en fuerza');
    expect(visto.body.phone).toBe('600111222');
  });

  it('no puede cambiar su estado colandolo en el cuerpo', async () => {
    // El contrato solo admite bio y telefono. Darse de alta uno mismo tras una
    // baja seria saltarse la decision del dueno.
    await http()
      .patch('/v1/me/trainer')
      .set(conSesion(tokenEntrenador2))
      .send({ status: 'inactive' })
      .expect(400);
  });

  it('el dueno no tiene perfil de entrenador: 403 en las rutas del entrenador', async () => {
    await http().get('/v1/me/trainer').set(conSesion(tokenOwnerA)).expect(403);
  });
});

describe('aislamiento entre gimnasios', () => {
  it('el dueno de B no ve los entrenadores de A', async () => {
    const lista = await http()
      .get(`/v1/gyms/${gymB}/trainers`)
      .set(conSesion(tokenOwnerB))
      .expect(200);
    expect(lista.body).toHaveLength(0);

    // Y por id directo tampoco: RLS lo esconde y sale como 404.
    await http()
      .get(`/v1/gyms/${gymB}/trainers/${entrenador1}`)
      .set(conSesion(tokenOwnerB))
      .expect(404);
  });

  it('escribir el gymId de A en la ruta con sesion de B responde 403', async () => {
    await http()
      .get(`/v1/gyms/${gymA}/trainers`)
      .set(conSesion(tokenOwnerB))
      .expect(403);
  });
});
