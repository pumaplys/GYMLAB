/**
 * TESTS DE ABUSO DEL FLUJO DE INVITACIONES (ADR-0010)
 *
 * Los seis que el ADR enumera como verificacion de la decision, mas el camino
 * completo alta -> invitacion -> aceptacion -> vinculacion.
 *
 * El riesgo que cierran: que un token de invitacion pueda fijar la contrasena de
 * una cuenta que ya existe. El email de la invitacion lo elige el personal del
 * gimnasio, asi que podria invitar a una direccion con cuenta en OTRO gimnasio;
 * si aceptar permitiera poner contrasena, quien tuviera el token se apoderaria
 * de esa cuenta y de su acceso al otro gimnasio.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  closeDatabase,
  createDatabase,
  EMAIL_QUEUES,
  eq,
  members,
  sql,
  withTenant,
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
const email = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const inicio = new Date();
const gimnasiosCreados: string[] = [];

/** Gimnasio 1: donde vive la cuenta que un atacante querria robar. */
let gym1: string;
let tokenOwner1: string;
/** Gimnasio 2: desde donde se intenta el secuestro. */
let gym2: string;
let tokenOwner2: string;

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

/** Da de alta un socio con email y lo invita. Devuelve id de ficha y token. */
async function socioInvitado(gymId: string, tokenStaff: string, quien: string) {
  const ficha = await http()
    .post(`/v1/gyms/${gymId}/members`)
    .set(conSesion(tokenStaff))
    .send({ firstName: 'Socio', lastName: quien, email: email(quien) })
    .expect(201);

  await http()
    .post(`/v1/gyms/${gymId}/members/${ficha.body.id}/invite`)
    .set(conSesion(tokenStaff))
    .expect(201);

  return { memberId: ficha.body.id as string, token: await tokenEncolado(email(quien)) };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 3 });

  const a = await registrarGimnasio('Gym Uno', 'owner1');
  tokenOwner1 = a.token;
  gym1 = a.gymId;
  const b = await registrarGimnasio('Gym Dos', 'owner2');
  tokenOwner2 = b.token;
  gym2 = b.gymId;
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
    for (const t of ['invitations', 'member_notes', 'members', 'member_counters', 'audit_log', 'memberships']) {
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

describe('camino completo: alta, invitacion, aceptacion, vinculacion', () => {
  it('la ficha queda vinculada a la cuenta recien creada', async () => {
    const inv = await socioInvitado(gym1, tokenOwner1, 'nuevo');

    // Antes de aceptar: ficha sin cuenta.
    const antes = await http()
      .get(`/v1/gyms/${gym1}/members/${inv.memberId}`)
      .set(conSesion(tokenOwner1))
      .expect(200);
    expect(antes.body.hasAccount).toBe(false);

    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.token, name: 'Nuevo Socio', password: PASSWORD })
      .expect(201);
    expect(alta.body.activeGymId).toBe(gym1);

    // Despues: vinculada, y el propio socio ve su ficha.
    const despues = await http()
      .get(`/v1/gyms/${gym1}/members/${inv.memberId}`)
      .set(conSesion(tokenOwner1))
      .expect(200);
    expect(despues.body.hasAccount).toBe(true);

    const propia = await http()
      .get('/v1/me/member-profile')
      .set(conSesion(alta.body.token))
      .expect(200);
    expect(propia.body.id).toBe(inv.memberId);
  });
});

describe('validaciones al invitar', () => {
  it('no se puede invitar a un socio sin email', async () => {
    const ficha = await http()
      .post(`/v1/gyms/${gym1}/members`)
      .set(conSesion(tokenOwner1))
      .send({ firstName: 'Sin', lastName: 'Email' })
      .expect(201);

    await http()
      .post(`/v1/gyms/${gym1}/members/${ficha.body.id}/invite`)
      .set(conSesion(tokenOwner1))
      .expect(400);
  });

  it('no se puede invitar a un socio que ya tiene cuenta vinculada', async () => {
    const inv = await socioInvitado(gym1, tokenOwner1, 'ya-vinculado');
    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.token, name: 'Ya', password: PASSWORD })
      .expect(201);

    // Crearia una segunda cuenta con otro email para la misma persona.
    await http()
      .post(`/v1/gyms/${gym1}/members/${inv.memberId}/invite`)
      .set(conSesion(tokenOwner1))
      .expect(400);
  });
});

describe('ADR-0010: un token NUNCA cambia la contrasena de una cuenta existente', () => {
  it('accept-invitation responde 409 y deja las credenciales intactas', async () => {
    // ESTE ES EL TEST CENTRAL DEL ADR.
    //
    // La victima tiene cuenta en el gimnasio 1. El gimnasio 2 la invita usando
    // su email —algo que nada impide— y se intenta aceptar con contrasena nueva.
    const victima = await socioInvitado(gym1, tokenOwner1, 'victima');
    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: victima.token, name: 'Victima', password: PASSWORD })
      .expect(201);

    const fichaEnDos = await http()
      .post(`/v1/gyms/${gym2}/members`)
      .set(conSesion(tokenOwner2))
      .send({ firstName: 'Misma', lastName: 'Persona', email: email('victima') })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gym2}/members/${fichaEnDos.body.id}/invite`)
      .set(conSesion(tokenOwner2))
      .expect(201);
    const tokenSecuestro = await tokenEncolado(email('victima'));

    // El intento de secuestro: 409, no 201.
    const intento = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: tokenSecuestro, name: 'Atacante', password: 'contrasena-atacante-1' })
      .expect(409);
    expect(intento.body.code).toBe('ACCOUNT_EXISTS');

    // Y lo que de verdad importa: la contrasena de la victima sigue siendo suya.
    await http()
      .post('/v1/auth/login')
      .send({ email: email('victima'), password: PASSWORD })
      .expect(201);
    await http()
      .post('/v1/auth/login')
      .send({ email: email('victima'), password: 'contrasena-atacante-1' })
      .expect(401);
  });
});

describe('ADR-0010: link-invitation', () => {
  it('sin sesion responde 401', async () => {
    const inv = await socioInvitado(gym1, tokenOwner1, 'sin-sesion');
    await http().post('/v1/auth/link-invitation').send({ token: inv.token }).expect(401);
  });

  it('con una sesion de OTRA direccion responde 403', async () => {
    // Un correo reenviado no debe servir para colarse en un gimnasio ajeno.
    const inv = await socioInvitado(gym1, tokenOwner1, 'ajena');

    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(tokenOwner2))
      .send({ token: inv.token })
      .expect(403);
  });

  it('vincula la cuenta al gimnasio y NO toca las credenciales', async () => {
    // Persona con cuenta en el gimnasio 1, invitada ahora al 2.
    const enUno = await socioInvitado(gym1, tokenOwner1, 'doble');
    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: enUno.token, name: 'Doble', password: PASSWORD })
      .expect(201);

    const fichaEnDos = await http()
      .post(`/v1/gyms/${gym2}/members`)
      .set(conSesion(tokenOwner2))
      .send({ firstName: 'Doble', lastName: 'EnDos', email: email('doble') })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gym2}/members/${fichaEnDos.body.id}/invite`)
      .set(conSesion(tokenOwner2))
      .expect(201);
    const tokenVinculo = await tokenEncolado(email('doble'));

    const res = await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(alta.body.token))
      .send({ token: tokenVinculo })
      .expect(201);
    expect(res.body.gymId).toBe(gym2);

    // La contrasena de siempre sigue sirviendo: link no toca credenciales.
    await http()
      .post('/v1/auth/login')
      .send({ email: email('doble'), password: PASSWORD })
      .expect(201);

    // Y ahora pertenece a los dos gimnasios, con la ficha del 2 vinculada.
    const me = await http().get('/v1/auth/me').set(conSesion(alta.body.token)).expect(200);
    expect(me.body.memberships).toHaveLength(2);

    const vinculada = await withTenant(owner, gym2, (tx) =>
      tx.select().from(members).where(eq(members.id, fichaEnDos.body.id)),
    );
    expect(vinculada[0]?.userId).not.toBeNull();
  });
});

describe('ADR-0010: el token es de un solo uso ENTRE los dos endpoints', () => {
  it('consumido por accept, link lo rechaza', async () => {
    const inv = await socioInvitado(gym1, tokenOwner1, 'un-uso-a');
    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: inv.token, name: 'UnUso', password: PASSWORD })
      .expect(201);

    const res = await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(alta.body.token))
      .send({ token: inv.token })
      .expect(400);

    // SE COMPRUEBA EL MOTIVO, no solo el 400, y hubo que aprender por que:
    // al falsificar este test quitando las guardas del token seguia pasando,
    // porque quien acepto ya pertenece al gimnasio y ese otro 400 tapaba el
    // fallo. Un test que pasa por el motivo equivocado no prueba nada.
    expect(res.body.message).toMatch(/ya se uso/i);
    expect(res.body.message).not.toMatch(/perteneces/i);
  });

  it('consumido por link, accept lo rechaza', async () => {
    const enUno = await socioInvitado(gym1, tokenOwner1, 'un-uso-b');
    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: enUno.token, name: 'UnUsoB', password: PASSWORD })
      .expect(201);

    const fichaEnDos = await http()
      .post(`/v1/gyms/${gym2}/members`)
      .set(conSesion(tokenOwner2))
      .send({ firstName: 'UnUso', lastName: 'EnDos', email: email('un-uso-b') })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gym2}/members/${fichaEnDos.body.id}/invite`)
      .set(conSesion(tokenOwner2))
      .expect(201);
    const tokenVinculo = await tokenEncolado(email('un-uso-b'));

    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(alta.body.token))
      .send({ token: tokenVinculo })
      .expect(201);

    // Ya consumido: el otro camino tambien lo rechaza.
    await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: tokenVinculo, name: 'Otro', password: PASSWORD })
      .expect(400);
  });
});

describe('link-invitation: contrato sin credenciales', () => {
  it('una contrasena colada en el cuerpo se ignora, no cambia nada', async () => {
    // El contrato solo admite `token`. Aunque alguien envie una contrasena, el
    // esquema la descarta: no hay dato con el que modificar credenciales.
    const enUno = await socioInvitado(gym1, tokenOwner1, 'contrato');
    const alta = await http()
      .post('/v1/auth/accept-invitation')
      .send({ token: enUno.token, name: 'Contrato', password: PASSWORD })
      .expect(201);

    const fichaEnDos = await http()
      .post(`/v1/gyms/${gym2}/members`)
      .set(conSesion(tokenOwner2))
      .send({ firstName: 'Contrato', lastName: 'EnDos', email: email('contrato') })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gym2}/members/${fichaEnDos.body.id}/invite`)
      .set(conSesion(tokenOwner2))
      .expect(201);

    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(alta.body.token))
      .send({ token: await tokenEncolado(email('contrato')), password: 'intento-de-cambio-1' })
      .expect(201);

    // La de siempre funciona; la colada, no.
    await http()
      .post('/v1/auth/login')
      .send({ email: email('contrato'), password: PASSWORD })
      .expect(201);
    await http()
      .post('/v1/auth/login')
      .send({ email: email('contrato'), password: 'intento-de-cambio-1' })
      .expect(401);
  });
});
