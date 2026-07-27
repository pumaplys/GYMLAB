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
  createDatabase,
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
import { env } from '../config/env';

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
});

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    expect(res.body.devToken).toBeTruthy();
    expect(res.body.role).toBe('member');
  });

  it('un recepcionista NO puede invitar a un dueno', async () => {
    // Se crea un recepcionista aceptando una invitacion, y se intenta escalar.
    const inv = await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('recepcion'), role: 'receptionist' })
      .expect(201);

    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.body.devToken, name: 'Rita', password: PASSWORD })
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
    const inv = await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('socio-2'), role: 'member' })
      .expect(201);

    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.body.devToken, name: 'Sonia', password: PASSWORD })
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
    return res.body as { id: string; devToken: string };
  }

  it('un token manipulado no sirve', async () => {
    const inv = await nuevaInvitacion('manipulado');
    const roto = `${inv.devToken.slice(0, -4)}XXXX`;

    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: roto, name: 'X', password: PASSWORD })
      .expect(400);
  });

  it('un token es de un solo uso', async () => {
    const inv = await nuevaInvitacion('unico');

    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.devToken, name: 'Uno', password: PASSWORD })
      .expect(201);

    // El segundo intento debe fallar aunque el token siga siendo valido en forma.
    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.devToken, name: 'Dos', password: PASSWORD })
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
      .send({ token: inv.devToken, name: 'Tarde', password: PASSWORD })
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
      .send({ token: inv.devToken, name: 'Tarde', password: PASSWORD })
      .expect(400);
  });

  it('el token se guarda hasheado, nunca en claro', async () => {
    const inv = await nuevaInvitacion('hasheado');

    const filas = await withTenant(owner, gymA, (tx) =>
      tx.select().from(invitations).where(eq(invitations.id, inv.id)),
    );

    expect(filas[0]?.tokenHash).not.toBe(inv.devToken);
    expect(filas[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('restablecer contrasena', () => {
  it('responde ok aunque el email no exista, para no revelar quien esta dado de alta', async () => {
    const res = await http()
      .post('/v1/auth/forgot-password')
      .send({ email: `no-existe-${sufijo}@test.local` })
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.devToken).toBeUndefined();
  });

  it('el token permite cambiar la contrasena una sola vez', async () => {
    const solicitud = await http()
      .post('/v1/auth/forgot-password')
      .send({ email: email('owner-b') })
      .expect(201);

    const token = solicitud.body.devToken as string;
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
