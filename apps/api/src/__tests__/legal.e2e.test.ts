/**
 * TESTS FUNCIONALES DE CONFIGURACION LEGAL
 *
 * Lo que se prueba aqui es una cadena de causas, no una pantalla:
 *
 *   identidad del responsable  ->  documento publicado  ->  aceptacion del socio
 *
 * y sobre todo que **cambiar el primer eslabon no toca los que ya se firmaron**.
 * Un consentimiento del art. 9 vale como prueba si se puede ensenar el texto
 * exacto que esa persona leyo; si editar la razon social reescribiera lo ya
 * aceptado, la prueba se evaporaria sin que nadie lo notara.
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

/** La que siembra la migracion. Es BORRADOR, y aqui solo sirve de vehiculo. */
const VERSION = '2026-09-01-borrador';

const IDENTIDAD = {
  legalName: 'Deportes del Norte, S.L.',
  taxId: 'B12345678',
  address: 'Calle Mayor 1, 28001 Madrid',
  privacyEmail: 'privacidad@deportesdelnorte.test',
};

let gymA: string;
let tokenOwnerA: string;
let tokenRecepcionA: string;
let gymB: string;
let tokenOwnerB: string;
let tokenSocioA: string;

beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  // El rol PROPIETARIO: estas comprobaciones miran tablas sin pasar por RLS.
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 3 });
  (env as { HEALTH_CONSENT_VERSION?: string }).HEALTH_CONSENT_VERSION = VERSION;

  const a = await registrarGimnasio('Norte');
  gymA = a.gymId;
  tokenOwnerA = a.token;
  tokenRecepcionA = await altaPersonal(gymA, tokenOwnerA, 'receptionist', 'recepcion');

  const b = await registrarGimnasio('Sur');
  gymB = b.gymId;
  tokenOwnerB = b.token;

  tokenSocioA = await socioConCuenta(gymA, tokenOwnerA, 'socia');
}, 120_000);

/**
 * Un socio con cuenta: ficha y usuario ENLAZADOS.
 *
 * Aceptar la invitacion crea la cuenta, pero su portal responde por la FICHA
 * —`myMember`—, asi que sin `members.user_id` apuntando a ella todo lo suyo
 * devuelve 404. Es el mismo montaje que usa la bateria de progreso.
 */
async function socioConCuenta(gymId: string, tokenStaff: string, quien: string) {
  const token = await altaPersonal(gymId, tokenStaff, 'member', quien);

  const cuenta = await owner.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${email(quien)}`,
  );
  const ficha = await http()
    .post(`/v1/gyms/${gymId}/members`)
    .set(conSesion(tokenStaff))
    .send({ firstName: 'Ana', lastName: 'Socia' })
    .expect(201);

  await owner.execute(
    sql`UPDATE members SET user_id = ${cuenta.rows[0]!.id}::uuid WHERE id = ${ficha.body.id}::uuid`,
  );
  return token;
}

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

async function registrarGimnasio(nombre: string) {
  const res = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: nombre,
      gymName: nombre,
      ownerName: nombre,
      email: email(nombre.toLowerCase()),
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

const guardar = (gymId: string, token: string, datos: Record<string, unknown>) =>
  http().put(`/v1/gyms/${gymId}/legal`).set(conSesion(token)).send(datos);

describe('quien puede configurar la identidad juridica', () => {
  it('el dueno la lee y la escribe', async () => {
    const antes = await http()
      .get(`/v1/gyms/${gymA}/legal`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    // Recien dado de alta: nada configurado, y lo dice campo por campo.
    expect(antes.body.missing).toEqual(['legalName', 'taxId', 'address', 'privacyEmail']);

    const despues = await guardar(gymA, tokenOwnerA, IDENTIDAD).expect(200);
    expect(despues.body.legalName).toBe(IDENTIDAD.legalName);
    expect(despues.body.missing).toEqual([]);
  });

  it('recepcion NO puede modificarla', async () => {
    // No basta con ocultarle el boton: se pide directamente al endpoint.
    await guardar(gymA, tokenRecepcionA, { legalName: 'Recepcion S.A.' }).expect(403);
    await http().get(`/v1/gyms/${gymA}/legal`).set(conSesion(tokenRecepcionA)).expect(403);

    const sigue = await http()
      .get(`/v1/gyms/${gymA}/legal`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(sigue.body.legalName).toBe(IDENTIDAD.legalName);
  });

  it('un socio no puede ni verla', async () => {
    await http().get(`/v1/gyms/${gymA}/legal`).set(conSesion(tokenSocioA)).expect(403);
    await guardar(gymA, tokenSocioA, { taxId: 'X0000000X' }).expect(403);
  });

  it('el dueno de otro gimnasio no ve ni toca esta', async () => {
    /*
     * Se pide con el gymId de A y la sesion de B. El `:gymId` de la URL no
     * elige tenant —lo hace `activeGymId` de la sesion—, asi que B recibe lo
     * suyo, nunca lo de A.
     */
    const suyo = await http()
      .get(`/v1/gyms/${gymA}/legal`)
      .set(conSesion(tokenOwnerB))
      .expect(200);

    expect(suyo.body.legalName).not.toBe(IDENTIDAD.legalName);
    expect(suyo.body.missing).toContain('legalName');
  });
});

describe('publicacion e inmutabilidad', () => {
  it('el documento congela la identidad del momento', async () => {
    const doc = await http()
      .get(`/v1/me/health-consent`)
      .set(conSesion(tokenSocioA))
      .expect(200);

    const cuerpo = doc.body.document.body as string;
    expect(doc.body.document.controller).toContain(IDENTIDAD.legalName);
    expect(cuerpo).toContain(IDENTIDAD.taxId);
    // La plantilla trae `{{responsable}}`: si no se sustituyo, el socio leeria
    // el marcador en vez de saber quien responde.
    expect(cuerpo).not.toContain('{{responsable}}');
  });

  it('cambiar la razon social DESPUES no altera lo ya publicado', async () => {
    const antes = await http()
      .get(`/v1/me/health-consent`)
      .set(conSesion(tokenSocioA))
      .expect(200);
    const documentoId = antes.body.document.id as string;

    await guardar(gymA, tokenOwnerA, { legalName: 'Deportes del Sur, S.L.' }).expect(200);

    const despues = await http()
      .get(`/v1/me/health-consent`)
      .set(conSesion(tokenSocioA))
      .expect(200);

    /*
     * Sigue siendo EL MISMO documento y con el MISMO texto. La identidad nueva
     * entrara cuando se publique una version nueva, no antes: lo que alguien
     * acepto no puede cambiar bajo sus pies.
     */
    expect(despues.body.document.id).toBe(documentoId);
    expect(despues.body.document.controller).toContain('Deportes del Norte');
    expect(despues.body.document.controller).not.toContain('Deportes del Sur');

    // Y se restaura para no arrastrar el cambio a los tests siguientes.
    await guardar(gymA, tokenOwnerA, { legalName: IDENTIDAD.legalName }).expect(200);
  });

  it('la aceptacion del socio apunta al documento exacto', async () => {
    const doc = await http()
      .get(`/v1/me/health-consent`)
      .set(conSesion(tokenSocioA))
      .expect(200);

    await http()
      .post(`/v1/me/health-consent`)
      .set(conSesion(tokenSocioA))
      .send({ version: VERSION })
      .expect(200);

    const fila = await owner.execute<{ document_id: string; version: string }>(
      sql`SELECT document_id, version FROM consents
          WHERE gym_id = ${gymA}::uuid AND purpose = 'health_data' AND revoked_at IS NULL
          ORDER BY granted_at DESC LIMIT 1`,
    );

    expect(fila.rows[0]!.document_id).toBe(doc.body.document.id);
    expect(fila.rows[0]!.version).toBe(VERSION);
  });
});

describe('fallo en cerrado', () => {
  it('sin identidad configurada NO se publica documento', async () => {
    /*
     * El gimnasio B nunca configuro sus datos legales. Su socio no puede
     * consentir nada, y eso es lo que impide recoger datos de salud amparados
     * en un documento que diria «el gimnasio» sin decir cual.
     */
    const tokenSocioB = await socioConCuenta(gymB, tokenOwnerB, 'socio-b');

    const res = await http()
      .get(`/v1/me/health-consent`)
      .set(conSesion(tokenSocioB))
      .expect(200);

    // Estado comprensible, no un 500: el socio ve que falta configuracion.
    expect(res.body.document).toBeNull();
    expect(res.body.accepted).toBe(false);

    const documentos = await owner.execute<{ n: string }>(
      sql`SELECT count(1)::text AS n FROM consent_documents WHERE gym_id = ${gymB}::uuid`,
    );
    expect(documentos.rows[0]!.n).toBe('0');
  });

  it('con la identidad a medias tampoco', async () => {
    await guardar(gymB, tokenOwnerB, { legalName: 'A medias, S.L.' }).expect(200);

    const estado = await http()
      .get(`/v1/gyms/${gymB}/legal`)
      .set(conSesion(tokenOwnerB))
      .expect(200);

    // Dice EXACTAMENTE que falta, en lugar de un "incompleto" a secas.
    expect(estado.body.missing).toEqual(['taxId', 'address', 'privacyEmail']);

    const documentos = await owner.execute<{ n: string }>(
      sql`SELECT count(1)::text AS n FROM consent_documents WHERE gym_id = ${gymB}::uuid`,
    );
    expect(documentos.rows[0]!.n).toBe('0');
  });
});
