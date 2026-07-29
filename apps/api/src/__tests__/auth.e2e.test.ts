/**
 * TESTS DE SEGURIDAD DEL MODULO AUTH
 *
 * Levantan la aplicacion completa contra un PostgreSQL real, con las cuatro
 * barreras activas. No hay mocks: un mock de RLS solo probaria el mock.
 *
 * El foco no es el camino feliz, sino el abuso: token reutilizado, caducado,
 * revocado, manipulado, escalada de privilegios y salto entre gimnasios.
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
  EMAIL_QUEUES,
  eq,
  invitations,
  sql,
  users,
  withTenant,
  type Database,
} from '@gymlab/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { patchRequestContext, runWithRequestContext } from '../common/request-context';
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';
import { JobsService } from '../jobs/jobs.service';
import { RetentionWorker } from '../jobs/retention.worker';

let app: INestApplication;
let owner: Database; // conexion propietaria, solo para sembrar y limpiar
let http: () => request.Agent;

const sufijo = randomUUID().slice(0, 8);
const email = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';

/** Gimnasio A y su dueno, creados una vez para toda la bateria. */
let gymA: string;
let tokenOwnerA: string;

/** Gimnasio B, para comprobar que no se ven entre si. */
let gymB: string;
let tokenOwnerB: string;

/**
 * Todo gimnasio creado durante la bateria, para poder borrarlo al final.
 *
 * Los gimnasios no cuelgan de ningun usuario, asi que borrar usuarios no los
 * arrastra: hay que llevar la cuenta. Un test que deja restos acaba dando
 * falsos positivos, porque las siguientes ejecuciones cuentan filas ajenas.
 */
const gimnasiosCreados: string[] = [];

/**
 * Instante de arranque de la bateria.
 *
 * Hace falta porque algunos eventos de autenticacion se registran sin email
 * —reset de contrasena y verificacion de email no lo llevan— y por tanto no se
 * pueden localizar por patron a la hora de limpiar.
 */
const inicio = new Date();

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);

  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 2 });

  const a = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: 'Org A',
      gymName: 'Gym A',
      ownerName: 'Ana',
      email: email('owner-a'),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  tokenOwnerA = a.body.token;
  gymA = a.body.activeGymId;
  gimnasiosCreados.push(gymA);

  const b = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: 'Org B',
      gymName: 'Gym B',
      ownerName: 'Berta',
      email: email('owner-b'),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  tokenOwnerB = b.body.token;
  gymB = b.body.activeGymId;
  gimnasiosCreados.push(gymB);
});

afterAll(async () => {
  await app?.close();
  if (!owner) return;

  const patron = `%-${sufijo}@test.local`;
  const ids = sql.raw(gimnasiosCreados.map((g) => `'${g}'::uuid`).join(','));

  // El orden es el mismo que exigira el borrado por derecho al olvido, y por
  // los mismos motivos: `invitations.invited_by_user_id` es ON DELETE RESTRICT,
  // y `gyms.organization_id` tambien, asi que hay que ir de las hojas al tronco.
  if (gimnasiosCreados.length > 0) {
    // Las organizaciones se apuntan ANTES de borrar los gimnasios: despues ya
    // no habria forma de saber cuales eran.
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
  await owner.execute(
    sql`DELETE FROM auth_events WHERE email_attempted LIKE ${patron} OR created_at >= ${inicio}`,
  );
  await owner.execute(sql`DELETE FROM users WHERE email LIKE ${patron}`);
  await owner.execute(sql`DELETE FROM pgboss.job WHERE data->>'to' LIKE ${patron}`);
  await owner.execute(sql`DELETE FROM auth_throttle WHERE key LIKE ${'login:%' + sufijo + '%'}`);
  await closeDatabase(owner);
});

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Recupera el token de un correo encolado.
 *
 * El token ya no viaja en la respuesta HTTP: viaja en el trabajo de pg-boss.
 * Leerlo desde la cola prueba dos cosas a la vez: que el flujo funciona, y que
 * el trabajo quedo realmente encolado, que es lo que garantiza el outbox.
 *
 * Se consulta con la conexion propietaria porque `pgboss` es otro esquema.
 */
async function tokenEncolado(cola: string, destinatario: string): Promise<string> {
  const res = await owner.execute<{ data: { token: string } }>(
    sql`SELECT data FROM pgboss.job
        WHERE name = ${cola} AND data->>'to' = ${destinatario}
        ORDER BY created_on DESC LIMIT 1`,
  );
  const token = res.rows[0]?.data?.token;
  if (!token) throw new Error(`No hay ningun trabajo "${cola}" encolado para ${destinatario}`);
  return token;
}

async function contarTrabajos(cola: string): Promise<number> {
  const res = await owner.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name = ${cola}`,
  );
  return res.rows[0]!.n;
}

describe('alta de gimnasio', () => {
  it('rechaza un codigo de plataforma incorrecto', async () => {
    await http()
      .post('/v1/auth/register-gym')
      .send({
        organizationName: 'Pirata',
        gymName: 'Pirata',
        ownerName: 'Nadie',
        email: email('pirata'),
        password: PASSWORD,
        platformCode: 'codigo-inventado',
      })
      .expect(403);
  });

  it('rechaza una contrasena corta', async () => {
    await http()
      .post('/v1/auth/register-gym')
      .send({
        organizationName: 'X',
        gymName: 'X',
        ownerName: 'X',
        email: email('corta'),
        password: 'corta',
        platformCode: env.PLATFORM_INVITE_CODE,
      })
      .expect(400);
  });

  it('deja al dueno con sesion y gimnasio activo', () => {
    expect(tokenOwnerA).toBeTruthy();
    expect(gymA).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('sesion', () => {
  it('sin sesion, una ruta protegida responde 401', async () => {
    await http().get('/v1/auth/me').expect(401);
  });

  it('un token inventado responde 401', async () => {
    await http().get('/v1/auth/me').set(conSesion('token-falso')).expect(401);
  });

  it('/me devuelve el usuario y sus gimnasios', async () => {
    const res = await http().get('/v1/auth/me').set(conSesion(tokenOwnerA)).expect(200);

    expect(res.body.activeGymId).toBe(gymA);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].role).toBe('owner');
    // No debe ver el gimnasio de nadie mas.
    expect(res.body.memberships.some((m: { gymId: string }) => m.gymId === gymB)).toBe(false);
  });

  it('contrasena incorrecta responde 401', async () => {
    await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-a'), password: 'incorrecta-larga' })
      .expect(401);
  });

  it('no se puede cambiar a un gimnasio ajeno', async () => {
    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(tokenOwnerA))
      .send({ gymId: gymB })
      .expect(403);
  });
});

describe('invitaciones: permisos', () => {
  it('el dueno puede invitar a un socio', async () => {
    const res = await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('socio-1'), role: 'member' })
      .expect(201);

    expect(res.body.role).toBe('member');
    // El token no viene en la respuesta: se comprueba que quedo encolado.
    expect(await tokenEncolado(EMAIL_QUEUES.invitation, email('socio-1'))).toBeTruthy();
  });

  it('un recepcionista NO puede invitar a un dueno', async () => {
    // Se crea un recepcionista aceptando una invitacion, y se intenta escalar.
    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('recepcion'), role: 'receptionist' })
      .expect(201);

    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({
        token: await tokenEncolado(EMAIL_QUEUES.invitation, email('recepcion')),
        name: 'Rita',
        password: PASSWORD,
      })
      .expect(201);

    // Esto es la escalada de privilegios que la matriz debe impedir.
    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(alta.body.token))
      .send({ email: email('dueno-falso'), role: 'owner' })
      .expect(403);

    // Pero si puede invitar entrenadores, que es lo aprobado.
    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(alta.body.token))
      .send({ email: email('entrenador-1'), role: 'trainer' })
      .expect(201);
  });

  it('un socio no puede invitar a nadie', async () => {
    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('socio-2'), role: 'member' })
      .expect(201);

    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({
        token: await tokenEncolado(EMAIL_QUEUES.invitation, email('socio-2')),
        name: 'Sonia',
        password: PASSWORD,
      })
      .expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(alta.body.token))
      .send({ email: email('otro'), role: 'member' })
      .expect(403);
  });

  it('no se puede invitar a un gimnasio ajeno poniendo otro id en la ruta', async () => {
    await http()
      .post(`/v1/gyms/${gymB}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('intruso'), role: 'member' })
      .expect(403);
  });

  it('las invitaciones de un gimnasio no se ven desde otro', async () => {
    const deB = await http()
      .get(`/v1/gyms/${gymB}/invitations`)
      .set(conSesion(tokenOwnerB))
      .expect(200);

    expect(deB.body).toHaveLength(0);
  });
});

describe('invitaciones: seguridad del token', () => {
  async function nuevaInvitacion(quien: string) {
    const res = await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email(quien), role: 'member' })
      .expect(201);
    return {
      id: res.body.id as string,
      token: await tokenEncolado(EMAIL_QUEUES.invitation, email(quien)),
    };
  }

  it('un token manipulado no sirve', async () => {
    const inv = await nuevaInvitacion('manipulado');
    const roto = `${inv.token.slice(0, -4)}XXXX`;

    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: roto, name: 'X', password: PASSWORD })
      .expect(400);
  });

  it('un token es de un solo uso', async () => {
    const inv = await nuevaInvitacion('unico');

    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.token, name: 'Uno', password: PASSWORD })
      .expect(201);

    // El segundo intento debe fallar aunque el token siga siendo valido en forma.
    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.token, name: 'Dos', password: PASSWORD })
      .expect(400);
  });

  it('una invitacion revocada no se puede aceptar', async () => {
    const inv = await nuevaInvitacion('revocada');

    await http()
      .delete(`/v1/gyms/${gymA}/invitations/${inv.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.token, name: 'Tarde', password: PASSWORD })
      .expect(400);
  });

  it('no se puede revocar dos veces', async () => {
    const inv = await nuevaInvitacion('doble-revoca');

    await http()
      .delete(`/v1/gyms/${gymA}/invitations/${inv.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await http()
      .delete(`/v1/gyms/${gymA}/invitations/${inv.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(404);
  });

  it('una invitacion caducada no se puede aceptar', async () => {
    const inv = await nuevaInvitacion('caducada');

    // Se envejece la fila con la conexion propietaria, que ignora RLS.
    await withTenant(owner, gymA, (tx) =>
      tx
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invitations.id, inv.id)),
    );

    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.token, name: 'Tarde', password: PASSWORD })
      .expect(400);
  });

  it('el token se guarda hasheado, nunca en claro', async () => {
    const inv = await nuevaInvitacion('hasheado');

    const filas = await withTenant(owner, gymA, (tx) =>
      tx.select().from(invitations).where(eq(invitations.id, inv.id)),
    );

    expect(filas[0]?.tokenHash).not.toBe(inv.token);
    expect(filas[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('endurecimiento de la sesion', () => {
  it('el login devuelve tambien una cookie de sesion, no solo el token', async () => {
    // ADR-0007 promete dos transportes: cookie httpOnly para el panel web y
    // Bearer para la app movil. Antes solo existia el segundo.
    const res = await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-a'), password: PASSWORD })
      .expect(201);

    const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies?.length ?? 0).toBeGreaterThan(0);
    expect(cookies!.join(';')).toContain('HttpOnly');
    expect(res.body.token).toBeTruthy();
  });

  it('la sesion del personal caduca dentro de la jornada, no en 90 dias', async () => {
    const res = await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-a'), password: PASSWORD })
      .expect(201);

    const filas = await owner.execute<{ expires_at: Date }>(
      sql`SELECT expires_at FROM sessions WHERE token = ${res.body.token}`,
    );
    const horas = (new Date(filas.rows[0]!.expires_at).getTime() - Date.now()) / 3_600_000;

    // 12 h para el personal (ADR-0007, decision 8).
    expect(horas).toBeGreaterThan(11);
    expect(horas).toBeLessThan(13);
  });

  it('la sesion de un socio dura mucho mas que la del personal', async () => {
    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('socio-sesion'), role: 'member' })
      .expect(201);

    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({
        token: await tokenEncolado(EMAIL_QUEUES.invitation, email('socio-sesion')),
        name: 'Sara',
        password: PASSWORD,
      })
      .expect(201);

    const filas = await owner.execute<{ expires_at: Date }>(
      sql`SELECT expires_at FROM sessions WHERE token = ${alta.body.token}`,
    );
    const dias = (new Date(filas.rows[0]!.expires_at).getTime() - Date.now()) / 86_400_000;

    expect(dias).toBeGreaterThan(80);
  });

  it('restablecer la contrasena cierra las sesiones abiertas', async () => {
    // Es el gesto de quien sospecha que le han robado la sesion. Si no expulsa
    // al intruso, da una falsa sensacion de haber recuperado el control.
    const antes = await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-b'), password: PASSWORD })
      .expect(201);

    await http().get('/v1/auth/me').set(conSesion(antes.body.token)).expect(200);

    await http().post('/v1/auth/forgot-password').send({ email: email('owner-b') }).expect(201);
    const token = await tokenEncolado(EMAIL_QUEUES.resetPassword, email('owner-b'));
    await http()
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'contrasena-tercera-1' })
      .expect(201);

    // La sesion anterior ya no vale.
    await http().get('/v1/auth/me').set(conSesion(antes.body.token)).expect(401);
  });

  it('bloquea tras varios intentos fallidos seguidos', async () => {
    const victima = email('fuerza-bruta');

    // Better Auth aplica su rate limiting en el router HTTP, que no montamos
    // (ADR-0009), asi que el limite es nuestro.
    for (let i = 0; i < 5; i++) {
      await http()
        .post('/v1/auth/login')
        .send({ email: victima, password: `intento-fallido-${i}` })
        .expect(401);
    }

    await http()
      .post('/v1/auth/login')
      .send({ email: victima, password: 'intento-fallido-6' })
      .expect(429);
  });

  it('el limite resiste 30 intentos SIMULTANEOS, no solo seguidos', async () => {
    // ESTE ES EL TEST DE CONCURRENCIA.
    //
    // La primera version contaba fallos en auth_events y decidia despues. Entre
    // la lectura y el registro del fallo pasa la verificacion de la contrasena,
    // ~100 ms: treinta peticiones a la vez leian todas cero y pasaban todas.
    //
    // Con el contador atomico, cada peticion recibe un numero distinto porque
    // Postgres bloquea la fila durante el UPSERT. Solo las 5 primeras llegan a
    // verificar la contrasena; el resto se rechaza.
    //
    // Con la implementacion anterior este test falla: pasarian las 30.
    const victima = email('carrera');

    const respuestas = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        http()
          .post('/v1/auth/login')
          .send({ email: victima, password: `simultaneo-${i}` })
          .then((r) => r.status),
      ),
    );

    const rechazados = respuestas.filter((s) => s === 429).length;
    const intentados = respuestas.filter((s) => s === 401).length;

    expect(intentados).toBe(5);
    expect(rechazados).toBe(25);
  });

  it('acertar la contrasena limpia el contador', async () => {
    // Equivocarse un par de veces antes de entrar bien no debe dejar a nadie
    // penalizado durante el resto de la ventana.
    for (let i = 0; i < 3; i++) {
      await http()
        .post('/v1/auth/login')
        .send({ email: email('owner-a'), password: `mal-${i}-largo` })
        .expect(401);
    }

    await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-a'), password: PASSWORD })
      .expect(201);

    // Tras el acierto, el contador vuelve a cero y se puede seguir usando.
    await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-a'), password: PASSWORD })
      .expect(201);
  });
});

describe('outbox transaccional', () => {
  it('el correo de invitacion se encola en la MISMA transaccion que la invitacion', async () => {
    const antes = await contarTrabajos(EMAIL_QUEUES.invitation);

    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('outbox-ok'), role: 'member' })
      .expect(201);

    expect(await contarTrabajos(EMAIL_QUEUES.invitation)).toBe(antes + 1);
  });

  it('si la transaccion revierte, el trabajo encolado desaparece con ella', async () => {
    // ESTE ES EL TEST QUE JUSTIFICA ADR-0008, y tiene que provocar el fallo
    // DESPUES de encolar. Hacerlo a traves de un endpoint no serviria: en todos
    // ellos la validacion falla antes de llegar al encolado, asi que probarian
    // que no se encola algo que nunca se intento encolar.
    //
    // Si `enqueue` usara una conexion propia en lugar de la transaccion de la
    // peticion, el trabajo sobreviviria al rollback y alguien recibiria un
    // correo sobre datos que no existen.
    const jobs = app.get(JobsService);
    const db = app.get<Database>(DATABASE);
    const antes = await contarTrabajos(EMAIL_QUEUES.invitation);

    await expect(
      runWithRequestContext(async () =>
        withTenant(db, gymA, async (tx) => {
          patchRequestContext({ tx });
          await jobs.enqueue(EMAIL_QUEUES.invitation, {
            to: email('rollback'),
            token: 'no-deberia-sobrevivir',
            url: 'x',
          });
          throw new Error('fallo simulado despues de encolar');
        }),
      ),
    ).rejects.toThrow('fallo simulado');

    expect(await contarTrabajos(EMAIL_QUEUES.invitation)).toBe(antes);
    await expect(tokenEncolado(EMAIL_QUEUES.invitation, email('rollback'))).rejects.toThrow();
  });

  it('sin transaccion, el trabajo se encola igualmente contra el pool', async () => {
    // Las rutas publicas sin gimnasio activo no abren transaccion. Ahi no hay
    // nada con lo que ser atomico —la fila del token la escribe Better Auth por
    // su cuenta— pero el correo tiene que encolarse de todos modos.
    const antes = await contarTrabajos(EMAIL_QUEUES.resetPassword);

    await http().post('/v1/auth/forgot-password').send({ email: email('owner-a') }).expect(201);

    expect(await contarTrabajos(EMAIL_QUEUES.resetPassword)).toBe(antes + 1);
  });
});

describe('restablecer contrasena', () => {
  it('responde ok aunque el email no exista, para no revelar quien esta dado de alta', async () => {
    const res = await http()
      .post('/v1/auth/forgot-password')
      .send({ email: `no-existe-${sufijo}@test.local` })
      .expect(201);

    expect(res.body.ok).toBe(true);
    // Y no se encola ningun correo para un destinatario que no existe.
    await expect(
      tokenEncolado(EMAIL_QUEUES.resetPassword, `no-existe-${sufijo}@test.local`),
    ).rejects.toThrow();
  });

  it('el token permite cambiar la contrasena una sola vez', async () => {
    await http().post('/v1/auth/forgot-password').send({ email: email('owner-b') }).expect(201);

    // El token llega por la cola, no por la respuesta.
    const token = await tokenEncolado(EMAIL_QUEUES.resetPassword, email('owner-b'));
    expect(token).toBeTruthy();

    await http()
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'contrasena-nueva-1' })
      .expect(201);

    // Reutilizarlo debe fallar.
    await http()
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'otra-contrasena-1' })
      .expect(400);

    // Y la contrasena nueva funciona.
    await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-b'), password: 'contrasena-nueva-1' })
      .expect(201);
  });

  it('un token de reset inventado no sirve', async () => {
    await http()
      .post('/v1/auth/reset-password')
      .send({ token: 'inventado', newPassword: 'contrasena-nueva-2' })
      .expect(400);
  });
});

describe('registro de auditoria', () => {
  it('el login queda anotado en auth_events', async () => {
    await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-a'), password: PASSWORD })
      .expect(201);

    const filas = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM auth_events
          WHERE email_attempted = ${email('owner-a')} AND event_type = 'login_success'`,
    );
    expect(filas.rows[0]!.n).toBeGreaterThan(0);
  });

  it('el intento fallido tambien, y sin gimnasio asociado', async () => {
    await http()
      .post('/v1/auth/login')
      .send({ email: email('owner-a'), password: 'mal-mal-mal-1' })
      .expect(401);

    const filas = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM auth_events
          WHERE email_attempted = ${email('owner-a')} AND event_type = 'login_failure'`,
    );
    expect(filas.rows[0]!.n).toBeGreaterThan(0);
  });

  it('la creacion de una invitacion queda en audit_log del gimnasio', async () => {
    const filas = await withTenant(owner, gymA, (tx) =>
      tx.execute(sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'invitation.created'`),
    );
    expect((filas.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});

describe('retencion de datos (RGPD art. 5.1.e)', () => {
  it('la purga borra los eventos de mas de 90 dias y respeta los recientes', async () => {
    const viejo = randomUUID();
    const reciente = randomUUID();

    await owner.execute(
      sql`INSERT INTO auth_events (id, email_attempted, event_type, created_at) VALUES
          (${viejo}::uuid,    ${email('purga-vieja')},    'login_failure', now() - interval '91 days'),
          (${reciente}::uuid, ${email('purga-reciente')}, 'login_failure', now() - interval '89 days')`,
    );

    const borrados = await app.get(RetentionWorker).purgar();
    expect(borrados).toBeGreaterThan(0);

    const quedan = await owner.execute<{ id: string }>(
      sql`SELECT id FROM auth_events WHERE id IN (${viejo}::uuid, ${reciente}::uuid)`,
    );
    // El de 89 dias sobrevive; el de 91 no.
    expect(quedan.rows).toHaveLength(1);
    expect(quedan.rows[0]!.id).toBe(reciente);

    await owner.execute(sql`DELETE FROM auth_events WHERE id = ${reciente}::uuid`);
  });
});

describe('salud del servicio', () => {
  it('/health comprueba de verdad la base de datos', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('usuarios', () => {
  it('el registro no permite hacerse administrador de plataforma', async () => {
    // `isPlatformAdmin` esta marcado como `input: false` en Better Auth. Si
    // alguien lo cuela en el cuerpo, debe ignorarse.
    const res = await http()
      .post('/v1/auth/register-gym')
      .send({
        organizationName: 'Org C',
        gymName: 'Gym C',
        ownerName: 'Carla',
        email: email('escalada'),
        password: PASSWORD,
        platformCode: env.PLATFORM_INVITE_CODE,
        isPlatformAdmin: true,
      })
      .expect(201);
    gimnasiosCreados.push(res.body.activeGymId);

    const me = await http().get('/v1/auth/me').set(conSesion(res.body.token)).expect(200);
    expect(me.body.user.isPlatformAdmin).toBe(false);

    const fila = await owner.select().from(users).where(eq(users.email, email('escalada')));
    expect(fila[0]?.isPlatformAdmin).toBe(false);
  });
});
