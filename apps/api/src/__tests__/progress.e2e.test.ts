/**
 * TESTS FUNCIONALES DE PROGRESO (peso y medidas)
 *
 * Categoria especial del RGPD (art. 9). El eje de la bateria es uno solo:
 * **sin consentimiento vigente no entra ni un dato**, y el bloqueo esta en el
 * servicio, asi que da igual el punto de entrada.
 *
 * La version del consentimiento se manipula por entorno dentro de cada test
 * —`env` se lee en caliente— para poder probar los tres estados: sin configurar,
 * configurada y sin aceptar, y aceptada.
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
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

/**
 * La version tiene que existir COMO PLANTILLA, no basta con nombrarla.
 *
 * Es la que siembra la migracion. Si se pone aqui una cualquiera, el gate falla
 * en cerrado con `CONSENT_NOT_CONFIGURED` — que es lo correcto: activar una
 * version cuyo texto nadie ha escrito seria recoger consentimientos sobre nada.
 */
const VERSION = '2026-09-01-borrador';
/** Una segunda, para probar que cambiar el texto caduca lo aceptado. */
const VERSION_NUEVA = '2027-01-01-prueba';

let gymA: string;
let tokenOwnerA: string;
let tokenRecepcionA: string;
let tokenEntrenador1: string;
let entrenador1: string;
let entrenador2: string;
let gymB: string;
let tokenOwnerB: string;

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Fija la version vigente del consentimiento para un test.
 *
 * `env` es el objeto ya validado, asi que escribir en el es lo que permite
 * probar el estado "todavia no hay texto legal" sin levantar otra aplicacion.
 */
function conVersion(valor: string | undefined) {
  (env as { HEALTH_CONSENT_VERSION?: string }).HEALTH_CONSENT_VERSION = valor;
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

  const gymId = res.body.activeGymId as string;
  const token = res.body.token as string;

  /*
   * Sin identidad del responsable NO se publica documento y no se puede
   * consentir nada: es el cierre en cerrado de #75. Estas pruebas van de
   * progreso y de la puerta del consentimiento, no de la configuracion legal,
   * asi que se deja lista aqui. El caso de "falta configurar" tiene sus propias
   * pruebas en legal.e2e.test.ts.
   */
  await http()
    .put(`/v1/gyms/${gymId}/legal`)
    .set(conSesion(token))
    .send({
      legalName: `${nombre} S.L.`,
      taxId: 'B00000000',
      address: 'Calle de Prueba 1, Madrid',
      privacyEmail: `privacidad@${quien}.test`,
    })
    .expect(200);

  return { token, gymId };
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

function aceptar(gymId: string, token: string, memberId: string, version = VERSION) {
  return http()
    .post(`/v1/gyms/${gymId}/members/${memberId}/health-consent`)
    .set(conSesion(token))
    .send({ version });
}

function registrarPeso(gymId: string, token: string, memberId: string, kg = 72.4) {
  return http()
    .post(`/v1/gyms/${gymId}/members/${memberId}/progress`)
    .set(conSesion(token))
    .send({ weightKg: kg });
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

afterEach(() => conVersion(undefined));

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
      'body_metrics',
      'consents',
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

describe('sin texto legal, no se registra nada', () => {
  it('registrar peso responde 403 con CONSENT_NOT_CONFIGURED', async () => {
    // ES EL ESTADO ACTUAL DEL PRODUCTO: el modulo esta listo y bloqueado a
    // proposito, porque no existe todavia el texto del consentimiento. Se
    // prefirio dejar el dato pendiente antes que inventar una version.
    conVersion(undefined);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinTexto');

    const res = await registrarPeso(gymA, tokenOwnerA, socio).expect(403);

    expect(res.body.code).toBe('CONSENT_NOT_CONFIGURED');
    expect(res.body.message).toMatch(/texto legal/i);
  });

  it('tampoco se puede aceptar un consentimiento que no existe', async () => {
    conVersion(undefined);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinTexto2');

    await aceptar(gymA, tokenOwnerA, socio).expect(400);
  });

  it('y no queda ni una fila en la base de datos', async () => {
    // El bloqueo no es cosmetico: se comprueba contra la tabla, no contra el
    // codigo de respuesta.
    conVersion(undefined);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinTexto3');
    await registrarPeso(gymA, tokenOwnerA, socio).expect(403);

    const filas = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM body_metrics WHERE member_id = ${socio}::uuid`,
    );
    expect(Number(filas.rows[0]!.n)).toBe(0);
  });
});

describe('con texto legal, hace falta que el socio lo acepte', () => {
  it('sin aceptacion responde 403 con CONSENT_REQUIRED', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinAceptar');

    const res = await registrarPeso(gymA, tokenOwnerA, socio).expect(403);

    expect(res.body.code).toBe('CONSENT_REQUIRED');
    expect(res.body.message).toContain(VERSION);
  });

  it('tras aceptar, se registra y guarda bajo que version', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Acepta');

    const estado = await aceptar(gymA, tokenOwnerA, socio).expect(200);
    expect(estado.body.accepted).toBe(true);
    expect(estado.body.currentVersion).toBe(VERSION);

    const medida = await registrarPeso(gymA, tokenOwnerA, socio, 72.4).expect(201);
    expect(medida.body.weightKg).toBe(72.4);
    // Ante una reclamacion hay que poder demostrar bajo que texto se recogio
    // CADA dato, no solo que hubo un consentimiento alguna vez.
    expect(medida.body.consentVersion).toBe(VERSION);
  });

  it('aceptar dos veces la misma version NO crea una segunda fila', async () => {
    // En el mostrador se pulsa dos veces. Duplicar la aceptacion no mejora la
    // prueba: ante una autoridad hay que poder decir CUANDO acepto esta persona
    // esta version, no ofrecer dos fechas para lo mismo.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'DobleAcepta');

    const primera = await aceptar(gymA, tokenOwnerA, socio).expect(200);
    const segunda = await aceptar(gymA, tokenOwnerA, socio).expect(200);

    expect(segunda.body.accepted).toBe(true);
    expect(segunda.body.acceptedAt).toBe(primera.body.acceptedAt);

    const filas = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM consents
          WHERE member_id = ${socio}::uuid AND purpose = 'health_data' AND revoked_at IS NULL`,
    );
    expect(Number(filas.rows[0]!.n)).toBe(1);
  });

  it('tras revocar, se puede volver a aceptar la MISMA version', async () => {
    // El indice es parcial sobre las no revocadas justo para permitir esto: la
    // fila revocada queda como historial y la nueva no choca.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'RevocaYVuelve');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio}/health-consent`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await aceptar(gymA, tokenOwnerA, socio).expect(200);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    const total = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM consents WHERE member_id = ${socio}::uuid`,
    );
    expect(Number(total.rows[0]!.n)).toBe(2);
  });

  it('no se puede aceptar una version distinta de la vigente', async () => {
    // Sin esto, una app antigua registraria la aceptacion de un texto retirado.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'VersionVieja');

    await aceptar(gymA, tokenOwnerA, socio, '2020-01-01').expect(400);
  });

  it('un socio SIN cuenta puede consentir y tener datos', async () => {
    // Es el caso que el modelo anterior no sabia representar, y es justo quien
    // mas pasa por la bascula del entrenador: la persona que nunca instalara la
    // app. Su consentimiento se recoge en el mostrador.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinCuenta');

    await aceptar(gymA, tokenOwnerA, socio).expect(200);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);
  });
});

describe('cambiar la version exige aceptar de nuevo', () => {
  it('lo ya aceptado deja de valer al cambiar el texto', async () => {
    // LO QUE PEDISTE EXPLICITAMENTE. La validez se comprueba contra la version
    // exacta, asi que el consentimiento viejo caduca solo — nadie tiene que
    // acordarse de invalidarlo.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'CambioVersion');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    // Cambiar de version es publicar OTRO TEXTO, no renombrar el mismo: por eso
    // hace falta que exista su plantilla. Sin ella se falla en cerrado.
    await owner.execute(
      sql`INSERT INTO consent_document_templates (purpose, version, title, body)
          VALUES ('health_data', ${VERSION_NUEVA}, 'Texto de prueba',
                  'Responsable: {{responsable}}. Cuerpo nuevo.')
          ON CONFLICT DO NOTHING`,
    );
    conVersion(VERSION_NUEVA);

    const res = await registrarPeso(gymA, tokenOwnerA, socio).expect(403);
    expect(res.body.code).toBe('CONSENT_REQUIRED');

    // Y aceptando la nueva, vuelve a funcionar.
    await aceptar(gymA, tokenOwnerA, socio, VERSION_NUEVA).expect(200);
    const nueva = await registrarPeso(gymA, tokenOwnerA, socio).expect(201);
    expect(nueva.body.consentVersion).toBe(VERSION_NUEVA);
  });

  it('la version que no tiene plantilla no vale: se falla en cerrado', async () => {
    // Nombrar una version no la crea. Sin texto sembrado no hay documento que
    // publicar, y sin documento no se recoge ningun consentimiento.
    conVersion('2099-01-01-inexistente');
    const socio = await altaSocio(gymA, tokenOwnerA, 'SinPlantilla');

    const res = await registrarPeso(gymA, tokenOwnerA, socio).expect(403);
    expect(res.body.code).toBe('CONSENT_NOT_CONFIGURED');
  });

  it('revocar bloquea nuevos registros pero conserva los anteriores', async () => {
    // El consentimiento es revocable: es un derecho. Lo ya recogido sigue
    // consultable para poder atender una peticion de acceso o de borrado.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Revoca');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio}/health-consent`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await registrarPeso(gymA, tokenOwnerA, socio).expect(403);

    const historial = await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(historial.body).toHaveLength(1);
  });
});

describe('la puerta esta en el servicio, no en el controlador', () => {
  it('el socio registrando su PROPIO peso pasa por el mismo bloqueo', async () => {
    // Otro punto de entrada, misma regla. Que uno mismo meta el dato no cambia
    // que sea categoria especial.
    conVersion(VERSION);
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-propio');
    const yo = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('socio-propio')}`,
    );
    const memberId = await altaSocio(gymA, tokenOwnerA, 'Propio');
    await owner.execute(
      sql`UPDATE members SET user_id = ${yo.rows[0]!.id}::uuid WHERE id = ${memberId}::uuid`,
    );

    const bloqueado = await http()
      .post('/v1/me/progress')
      .set(conSesion(tokenSocio))
      .send({ weightKg: 70 })
      .expect(403);
    expect(bloqueado.body.code).toBe('CONSENT_REQUIRED');

    await aceptar(gymA, tokenOwnerA, memberId).expect(200);

    await http()
      .post('/v1/me/progress')
      .set(conSesion(tokenSocio))
      .send({ weightKg: 70 })
      .expect(201);

    const mio = await http().get('/v1/me/progress').set(conSesion(tokenSocio)).expect(200);
    expect(mio.body).toHaveLength(1);
  });

  it('borrar una medicion tambien exige consentimiento vigente', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'BorraMedida');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);
    const medida = await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    conVersion(undefined);
    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio}/progress/${medida.body.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(403);
  });
});

describe('quien puede ver datos de salud', () => {
  it('RECEPCION NO ACCEDE, ni para leer', async () => {
    // Minimizacion (art. 5.1.c) aplicada a los roles: quien atiende el mostrador
    // no necesita el peso de nadie para su trabajo.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Privado');

    await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenRecepcionA))
      .expect(403);
    await registrarPeso(gymA, tokenRecepcionA, socio).expect(403);
  });

  it('un entrenador solo ve los datos de SUS socios', async () => {
    conVersion(VERSION);
    const mio = await altaSocio(gymA, tokenOwnerA, 'MioSalud');
    const ajeno = await altaSocio(gymA, tokenOwnerA, 'AjenoSalud');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador1}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: mio })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador2}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: ajeno })
      .expect(201);
    await aceptar(gymA, tokenOwnerA, mio).expect(200);

    await registrarPeso(gymA, tokenEntrenador1, mio).expect(201);

    await http()
      .get(`/v1/gyms/${gymA}/members/${ajeno}/progress`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);
  });

  it('el gimnasio B no ve los datos de un socio de A', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'DeA');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    await http()
      .get(`/v1/gyms/${gymB}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerB))
      .expect(404);
  });

  it('un entrenador tampoco escribe en un socio de otro gimnasio', async () => {
    // Leer ya estaba cubierto; escribir es lo que crearia el dato, asi que se
    // comprueba aparte. El socio de B no existe para esta sesion.
    conVersion(VERSION);
    const deB = await altaSocio(gymB, tokenOwnerB, 'DeBSalud');
    await registrarPeso(gymA, tokenEntrenador1, deB).expect(404);
  });

  it('un id de socio inventado responde 404, no 500', async () => {
    conVersion(VERSION);
    const inventado = randomUUID();

    await http()
      .get(`/v1/gyms/${gymA}/members/${inventado}/progress`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);
    await registrarPeso(gymA, tokenEntrenador1, inventado).expect(404);
  });

  it('escribir el gymId de otro en la URL responde 403', async () => {
    conVersion(VERSION);
    const mio = await altaSocio(gymA, tokenOwnerA, 'GymAjeno');

    await http()
      .get(`/v1/gyms/${gymB}/members/${mio}/progress`)
      .set(conSesion(tokenEntrenador1))
      .expect(403);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UN SOCIO NO ES PERSONAL, Y LA RUTA CON `:memberId` NO ES SUYA.           │
   * │                                                                          │
   * │ Tiene `/me/progress` para lo propio. La ruta con identificador esta      │
   * │ cerrada por `@Roles('owner','trainer')`, asi que ni siquiera llega al    │
   * │ servicio — que es donde vive la comprobacion de que el socio sea el      │
   * │ mismo. Las dos capas existen; esta prueba fija la primera.               │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('un socio no entra por la ruta del personal, ni para sus propios datos', async () => {
    conVersion(VERSION);
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-progreso');

    // Aceptar la invitacion crea la CUENTA, no la ficha: se enlazan a mano, que
    // es lo que hace que la ficha sea de verdad la suya y no la de otro.
    const cuenta = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('socio-progreso')}`,
    );
    const suId = await altaSocio(gymA, tokenOwnerA, 'ConCuentaProgreso');
    await owner.execute(
      sql`UPDATE members SET user_id = ${cuenta.rows[0]!.id}::uuid WHERE id = ${suId}::uuid`,
    );

    await http()
      .get(`/v1/gyms/${gymA}/members/${suId}/progress`)
      .set(conSesion(tokenSocio))
      .expect(403);
    await registrarPeso(gymA, tokenSocio, suId).expect(403);

    // Y tampoco puede tocar el consentimiento de nadie, ni el suyo.
    await aceptar(gymA, tokenSocio, suId).expect(403);
    await http()
      .delete(`/v1/gyms/${gymA}/members/${suId}/health-consent`)
      .set(conSesion(tokenSocio))
      .expect(403);
  });
});

/**
 * CAMBIAR DE GIMNASIO CORTA EL ACCESO AL ANTERIOR.
 *
 * Importa mas aqui que en ninguna otra pantalla: si una sesion que ya apunta a
 * otro gimnasio pudiera escribir en el anterior, el dato de salud acabaria en el
 * sitio equivocado. Se comprueba que ni leer ni escribir sobreviven al cambio.
 */
/**
 * EL SOCIO GESTIONA SU PROPIO CONSENTIMIENTO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE HACE SEGURAS ESTAS RUTAS ES QUE NO TIENEN `:memberId`.            │
 * │                                                                          │
 * │ No hay ningun parametro que un socio pueda manipular para hablar del     │
 * │ consentimiento de otro: la ficha sale del `user_id` de la sesion. No es  │
 * │ que se valide bien, es que no existe la via.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('el socio y su propio consentimiento', () => {
  /** Crea una cuenta de socio con ficha enlazada, que es lo que exige `/me/*`. */
  async function socioConCuenta(quien: string) {
    const token = await altaPersonal(gymA, tokenOwnerA, 'member', quien);
    const cuenta = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email(quien)}`,
    );
    const memberId = await altaSocio(gymA, tokenOwnerA, quien);
    await owner.execute(
      sql`UPDATE members SET user_id = ${cuenta.rows[0]!.id}::uuid WHERE id = ${memberId}::uuid`,
    );
    return { token, memberId };
  }

  const mio = (token: string) => http().get('/v1/me/health-consent').set(conSesion(token));

  it('ve su estado CON el texto que tendria que leer antes de aceptar', async () => {
    conVersion(VERSION);
    const { token } = await socioConCuenta('socio-consent-1');

    const res = await mio(token).expect(200);
    expect(res.body.accepted).toBe(false);
    expect(res.body.currentVersion).toBe(VERSION);
    // Sin texto, aceptar seria pulsar un boton a ciegas: no es consentimiento.
    expect(res.body.document.body.length).toBeGreaterThan(100);
    expect(res.body.document.controller).toContain('Gym A');
    expect(res.body.document.version).toBe(VERSION);
  });

  it('sin documento publicado lo dice, y no inventa un texto', async () => {
    conVersion(undefined);
    const { token } = await socioConCuenta('socio-consent-2');

    const res = await mio(token).expect(200);
    expect(res.body.currentVersion).toBeNull();
    expect(res.body.document).toBeNull();
    expect(res.body.accepted).toBe(false);
  });

  it('acepta para si mismo y queda apuntando al documento exacto', async () => {
    conVersion(VERSION);
    const { token, memberId } = await socioConCuenta('socio-consent-3');

    const estado = await mio(token).expect(200);
    const res = await http()
      .post('/v1/me/health-consent')
      .set(conSesion(token))
      .send({ version: VERSION })
      .expect(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.acceptedAt).not.toBeNull();

    // La fila apunta al documento, no solo a su nombre: es lo que la convierte
    // en prueba de que acepto un texto concreto.
    const fila = await owner.execute<{ document_id: string; version: string }>(
      sql`SELECT document_id, version FROM consents
          WHERE member_id = ${memberId}::uuid AND purpose = 'health_data'
            AND revoked_at IS NULL`,
    );
    expect(fila.rows[0]!.document_id).toBe(estado.body.document.id);
    expect(fila.rows[0]!.version).toBe(VERSION);
  });

  it('una version distinta de la vigente se rechaza', async () => {
    conVersion(VERSION);
    const { token } = await socioConCuenta('socio-consent-4');

    await http()
      .post('/v1/me/health-consent')
      .set(conSesion(token))
      .send({ version: '2099-12-31' })
      .expect(400);
  });

  it('un purpose manipulado no llega a ninguna parte', async () => {
    // El cuerpo solo admite `version`: la finalidad la fija el servidor. Un
    // campo de mas se ignora, no elige sobre que se consiente.
    conVersion(VERSION);
    const { token, memberId } = await socioConCuenta('socio-consent-5');

    await http()
      .post('/v1/me/health-consent')
      .set(conSesion(token))
      .send({ version: VERSION, purpose: 'image_rights' })
      .expect(200);

    const filas = await owner.execute<{ purpose: string }>(
      sql`SELECT purpose FROM consents WHERE member_id = ${memberId}::uuid`,
    );
    expect(filas.rows.map((f) => f.purpose)).toEqual(['health_data']);
  });

  it('mandar memberId o userId en el cuerpo no cambia de quien es', async () => {
    conVersion(VERSION);
    const otro = await socioConCuenta('socio-consent-6');
    const yo = await socioConCuenta('socio-consent-7');

    await http()
      .post('/v1/me/health-consent')
      .set(conSesion(yo.token))
      .send({ version: VERSION, memberId: otro.memberId, userId: otro.memberId })
      .expect(200);

    // El de verdad acepto; el otro sigue sin nada.
    const suyas = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM consents WHERE member_id = ${otro.memberId}::uuid`,
    );
    expect(Number(suyas.rows[0]!.n)).toBe(0);
    const mias = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM consents WHERE member_id = ${yo.memberId}::uuid`,
    );
    expect(Number(mias.rows[0]!.n)).toBe(1);
  });

  it('revoca el suyo, y eso bloquea nuevas mediciones pero conserva las hechas', async () => {
    conVersion(VERSION);
    const { token, memberId } = await socioConCuenta('socio-consent-8');

    await http()
      .post('/v1/me/health-consent')
      .set(conSesion(token))
      .send({ version: VERSION })
      .expect(200);
    await registrarPeso(gymA, tokenOwnerA, memberId).expect(201);

    const tras = await http().delete('/v1/me/health-consent').set(conSesion(token)).expect(200);
    expect(tras.body.accepted).toBe(false);

    await registrarPeso(gymA, tokenOwnerA, memberId).expect(403);

    const historial = await http()
      .get(`/v1/gyms/${gymA}/members/${memberId}/progress`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(historial.body).toHaveLength(1);

    // Y queda traza de la revocacion.
    const auditoria = await owner.execute<{ action: string }>(
      sql`SELECT action FROM audit_log WHERE entity_id = ${memberId}::uuid
          AND action = 'consent.revoked'`,
    );
    expect(auditoria.rows).toHaveLength(1);
  });

  it('puede volver a aceptar despues de revocar', async () => {
    conVersion(VERSION);
    const { token, memberId } = await socioConCuenta('socio-consent-9');

    const aceptar = () =>
      http().post('/v1/me/health-consent').set(conSesion(token)).send({ version: VERSION });

    await aceptar().expect(200);
    await http().delete('/v1/me/health-consent').set(conSesion(token)).expect(200);
    const vuelta = await aceptar().expect(200);
    expect(vuelta.body.accepted).toBe(true);

    // La revocada se queda como historial: es la prueba de que existio.
    const filas = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM consents WHERE member_id = ${memberId}::uuid`,
    );
    expect(Number(filas.rows[0]!.n)).toBe(2);
  });

  it('quien no tiene ficha de socio en este gimnasio no tiene nada que gestionar', async () => {
    // El entrenador y el dueno llegan a la ruta —no lleva `@Roles`— y reciben
    // 404 al resolver su ficha. No es un permiso denegado: es que no son socios.
    conVersion(VERSION);

    await mio(tokenEntrenador1).expect(404);
    await mio(tokenOwnerA).expect(404);
    await http()
      .post('/v1/me/health-consent')
      .set(conSesion(tokenEntrenador1))
      .send({ version: VERSION })
      .expect(404);
    await http().delete('/v1/me/health-consent').set(conSesion(tokenRecepcionA)).expect(404);
  });

  it('sin sesion no se llega', async () => {
    await http().get('/v1/me/health-consent').expect(401);
    await http().post('/v1/me/health-consent').send({ version: VERSION }).expect(401);
  });

  it('el consentimiento no cruza de gimnasio: es de su gimnasio, no suyo', async () => {
    // La tabla lleva `gym_id` por una razon legal: el socio consiente que SU
    // gimnasio trate sus datos, no que lo haga GYMLAB.
    conVersion(VERSION);
    const { token, memberId } = await socioConCuenta('socio-consent-10');
    await http()
      .post('/v1/me/health-consent')
      .set(conSesion(token))
      .send({ version: VERSION })
      .expect(200);

    // La misma persona, socia tambien del gimnasio B.
    await http()
      .post(`/v1/gyms/${gymB}/invitations`)
      .set(conSesion(tokenOwnerB))
      .send({ email: email('socio-consent-10'), role: 'member' })
      .expect(201);
    const job = await owner.execute<{ data: { token: string } }>(
      sql`SELECT data FROM pgboss.job WHERE name = ${EMAIL_QUEUES.invitation}
          AND data->>'to' = ${email('socio-consent-10')} ORDER BY created_on DESC LIMIT 1`,
    );
    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(token))
      .send({ token: job.rows[0]!.data.token })
      .expect(201);
    const enB = await altaSocio(gymB, tokenOwnerB, 'MismaPersonaEnB');
    const cuenta = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('socio-consent-10')}`,
    );
    await owner.execute(
      sql`UPDATE members SET user_id = ${cuenta.rows[0]!.id}::uuid WHERE id = ${enB}::uuid`,
    );

    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(token))
      .send({ gymId: gymB })
      .expect(201);

    // En B no ha aceptado nada, aunque en A si.
    const enBEstado = await mio(token).expect(200);
    expect(enBEstado.body.accepted).toBe(false);
    expect(enBEstado.body.document.controller).toContain('Gym B');

    // Y lo de A sigue intacto.
    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(token))
      .send({ gymId: gymA })
      .expect(201);
    const enAEstado = await mio(token).expect(200);
    expect(enAEstado.body.accepted).toBe(true);
    expect(enAEstado.body.document.controller).toContain('Gym A');
    expect(memberId).toBeTruthy();
  });
});

describe('un entrenador que cambia de gimnasio', () => {
  it('deja de poder leer y escribir el progreso del gimnasio anterior', async () => {
    conVersion(VERSION);

    const mio = await altaSocio(gymA, tokenOwnerA, 'AntesDelCambio');
    await http()
      .post(`/v1/gyms/${gymA}/trainers/${entrenador1}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: mio })
      .expect(201);
    await aceptar(gymA, tokenOwnerA, mio).expect(200);
    await registrarPeso(gymA, tokenEntrenador1, mio).expect(201);

    // Se le vincula al gimnasio B con la cuenta que ya tiene (ADR-0010).
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

    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(tokenEntrenador1))
      .send({ gymId: gymB })
      .expect(201);

    // Con el gimnasio de A en la URL: 403 por contexto, antes de tocar la base.
    await http()
      .get(`/v1/gyms/${gymA}/members/${mio}/progress`)
      .set(conSesion(tokenEntrenador1))
      .expect(403);
    await registrarPeso(gymA, tokenEntrenador1, mio).expect(403);

    // Con el gimnasio activo correcto: ese socio no existe aqui.
    await http()
      .get(`/v1/gyms/${gymB}/members/${mio}/progress`)
      .set(conSesion(tokenEntrenador1))
      .expect(404);
    await registrarPeso(gymB, tokenEntrenador1, mio).expect(404);

    // Se vuelve a A: los tests que siguen usan este mismo token.
    await http()
      .post('/v1/auth/switch-gym')
      .set(conSesion(tokenEntrenador1))
      .send({ gymId: gymA })
      .expect(201);
  });
});

describe('el dato', () => {
  it('los decimales sobreviven al viaje', async () => {
    // `numeric` y no coma flotante: 72,45 debe volver siendo 72,45.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Decimales');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);

    await registrarPeso(gymA, tokenOwnerA, socio, 72.45).expect(201);

    const historial = await http()
      .get(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(historial.body[0].weightKg).toBe(72.45);
  });

  it('una medicion fechada en el futuro no se acepta', async () => {
    // Una medida de manana no existe: solo puede ser un error de teclado. Mismo
    // criterio que la fecha de nacimiento en `members`.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Futuro');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);

    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerA))
      .send({ weightKg: 70, measuredAt: manana })
      .expect(400);

    // El pasado si: el entrenador apunta el lunes lo del sabado.
    const anteayer = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerA))
      .send({ weightKg: 70, measuredAt: anteayer })
      .expect(201);
  });

  it('una medicion vacia no se acepta', async () => {
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Vacia');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio}/progress`)
      .set(conSesion(tokenOwnerA))
      .send({ notes: 'solo una nota' })
      .expect(400);
  });

  it('borrar la ficha del socio se lleva sus datos de salud', async () => {
    // Derecho al olvido (art. 17): aqui no hay excepcion contable que valga, al
    // contrario que con los pagos. Los datos de salud se van.
    conVersion(VERSION);
    const socio = await altaSocio(gymA, tokenOwnerA, 'Olvido');
    await aceptar(gymA, tokenOwnerA, socio).expect(200);
    await registrarPeso(gymA, tokenOwnerA, socio).expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const quedan = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM body_metrics WHERE member_id = ${socio}::uuid`,
    );
    expect(Number(quedan.rows[0]!.n)).toBe(0);
  });
});
