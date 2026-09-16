/**
 * LA POLITICA DE CONSERVACION, EJECUTANDOSE DE VERDAD.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CADA PURGA SE PRUEBA POR LAS DOS CARAS.                                  │
 * │                                                                          │
 * │ Que borre lo caducado es la mitad facil. La que de verdad importa es la  │
 * │ otra: que NO borre lo que todavia no toca, que NO cruce de un gimnasio a │
 * │ otro y que NO se lleve por delante a quien retiro el consentimiento y    │
 * │ volvio a aceptarlo. Una purga que borra de mas no da un error: deja un   │
 * │ hueco que nadie encuentra hasta que alguien pregunta por sus datos.      │
 * │                                                                          │
 * │ Por eso casi todos los tests de aqui afirman DOS cosas, y una de ellas   │
 * │ siempre es lo que sigue en pie.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
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
  MAINTENANCE_QUEUES,
  RETENCION,
  sql,
  type Database,
} from '@gymlab/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { env } from '../config/env';
import { RetentionWorker } from '../jobs/retention.worker';

let app: INestApplication;
let owner: Database;
let comoApp: Database;
let purgas: RetentionWorker;
let http: () => request.Agent;

const sufijo = randomUUID().slice(0, 8);
const email = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

/** La version de LANZAMIENTO vigente, la que siembra la migracion 0021. */
const VERSION = '2026-09-17';

const gimnasios: string[] = [];
let gymA: string;
let tokenA: string;
let gymB: string;
let tokenB: string;

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

  const gymId = res.body.activeGymId as string;
  const token = res.body.token as string;
  gimnasios.push(gymId);

  // Sin identidad del responsable no se publica documento y no se puede
  // consentir nada. Eso tiene sus propias pruebas; aqui estorba.
  await http()
    .patch(`/v1/gyms/${gymId}/legal`)
    .set(conSesion(token))
    .send({
      legalName: `${nombre} S.L.`,
      taxId: 'B00000000',
      address: 'Calle de Prueba 1, Madrid',
      privacyEmail: `privacidad@${quien}.test`,
    })
    .expect(200);

  return { gymId, token };
}

async function altaSocio(gymId: string, token: string, apellido: string): Promise<string> {
  const res = await http()
    .post(`/v1/gyms/${gymId}/members`)
    .set(conSesion(token))
    .send({ firstName: 'Socio', lastName: apellido })
    .expect(201);
  return res.body.id as string;
}

const aceptar = (gymId: string, token: string, memberId: string) =>
  http()
    .post(`/v1/gyms/${gymId}/members/${memberId}/health-consent`)
    .set(conSesion(token))
    .send({ version: VERSION });

const retirar = (gymId: string, token: string, memberId: string) =>
  http().delete(`/v1/gyms/${gymId}/members/${memberId}/health-consent`).set(conSesion(token));

const medir = (gymId: string, token: string, memberId: string, kg: number, notas?: string) =>
  http()
    .post(`/v1/gyms/${gymId}/members/${memberId}/progress`)
    .set(conSesion(token))
    .send({ weightKg: kg, ...(notas ? { notes: notas } : {}) });

const contarMediciones = async (gymId: string, memberId: string) => {
  const r = await owner.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM body_metrics
        WHERE gym_id = ${gymId}::uuid AND member_id = ${memberId}::uuid`,
  );
  return r.rows[0]!.n;
};

/** Envejece a mano lo que ya existe: es la unica forma de probar un plazo. */
const envejecer = (consulta: ReturnType<typeof sql>) => owner.execute(consulta);

beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  purgas = app.get(RetentionWorker);

  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 3 });
  comoApp = createDatabase({ connectionString: process.env.DATABASE_URL_APP!, max: 2 });

  (env as { HEALTH_CONSENT_VERSION?: string }).HEALTH_CONSENT_VERSION = VERSION;

  ({ gymId: gymA, token: tokenA } = await registrarGimnasio('RetA', 'owner-a'));
  ({ gymId: gymB, token: tokenB } = await registrarGimnasio('RetB', 'owner-b'));
});

afterAll(async () => {
  await app?.close();
  if (owner) {
    for (const gymId of gimnasios) {
      const orgs = await owner.execute<{ organization_id: string }>(
        sql`SELECT DISTINCT organization_id FROM gyms WHERE id = ${gymId}::uuid`,
      );
      await owner.execute(sql`DELETE FROM body_metrics WHERE gym_id = ${gymId}::uuid`);
      await owner.execute(sql`DELETE FROM consents WHERE gym_id = ${gymId}::uuid`);
      await owner.execute(sql`DELETE FROM consent_documents WHERE gym_id = ${gymId}::uuid`);
      await owner.execute(sql`DELETE FROM invitations WHERE gym_id = ${gymId}::uuid`);
      await owner.execute(sql`DELETE FROM audit_log WHERE gym_id = ${gymId}::uuid`);
      await owner.execute(sql`DELETE FROM members WHERE gym_id = ${gymId}::uuid`);
      await owner.execute(sql`DELETE FROM memberships WHERE gym_id = ${gymId}::uuid`);
      await owner.execute(sql`DELETE FROM gyms WHERE id = ${gymId}::uuid`);
      if (orgs.rows.length > 0) {
        const ids = sql.raw(orgs.rows.map((o) => `'${o.organization_id}'::uuid`).join(','));
        await owner.execute(sql`DELETE FROM organizations WHERE id IN (${ids})`);
      }
    }
    await owner.execute(sql`DELETE FROM users WHERE email LIKE ${`%-${sufijo}@test.local`}`);
    await owner.execute(sql`DELETE FROM auth_events WHERE email_attempted LIKE ${`%${sufijo}%`}`);
    await closeDatabase(owner);
  }
  if (comoApp) await closeDatabase(comoApp);
});

// ───────────────────────────────────────────────────────────────────────────
describe('la plantilla de lanzamiento', () => {
  it('existe y NO es un borrador', async () => {
    const r = await owner.execute<{ is_draft: boolean; title: string }>(
      sql`SELECT is_draft, title FROM consent_document_templates
          WHERE purpose = 'health_data' AND version = ${VERSION}`,
    );
    expect(r.rows[0], `deberia existir la plantilla ${VERSION}`).toBeTruthy();
    expect(r.rows[0]!.is_draft).toBe(false);
  });

  it('las versiones anteriores siguen intactas: se publica otra, no se edita', async () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ LA REGLA DE ESTA BASE DE DATOS: UN TEXTO ACEPTADO NO SE EDITA.   │
     * │                                                                  │
     * │ El borrador sigue siendo borrador, y `2026-09-16` —que prometia  │
     * │ 30 dias— sigue diciendo lo que decia. Corregirlas con un UPDATE  │
     * │ habria sido mas corto y habria destruido la prueba de que        │
     * │ alguien acepto ESE texto. Se publica otra version.                │
     * └──────────────────────────────────────────────────────────────────┘
     */
    const r = await owner.execute<{ version: string; is_draft: boolean }>(
      sql`SELECT version, is_draft FROM consent_document_templates
          WHERE purpose = 'health_data' AND version IN ('2026-09-01-borrador', '2026-09-16')
          ORDER BY version`,
    );
    const porVersion = new Map(r.rows.map((f) => [f.version, f.is_draft]));
    expect(porVersion.get('2026-09-01-borrador'), 'el borrador sigue siendo borrador').toBe(true);
    expect(porVersion.get('2026-09-16'), 'la anterior sigue existiendo').toBe(false);
  });

  it('su texto dice lo que el producto hace de verdad', async () => {
    const r = await owner.execute<{ body: string }>(
      sql`SELECT body FROM consent_document_templates
          WHERE purpose = 'health_data' AND version = ${VERSION}`,
    );
    const texto = r.rows[0]!.body;
    expect(texto).not.toContain('BORRADOR');
    // Las cuatro promesas que este documento hace y que el codigo cumple.
    expect(texto).toContain('{{responsable}}');
    expect(texto).toMatch(/RECEPCION NO ACCEDE/i);
    expect(texto).toMatch(/NO CONDICIONA TU PERTENENCIA/i);
    expect(texto).toContain('24 HORAS');
    // Y NO puede volver a prometer un mes para borrar datos del art. 9.
    expect(texto).not.toMatch(/30 dias/);
    // Lo que pasa si se restaura una copia tiene que estar dicho.
    expect(texto).toMatch(/RESTAURA UNA/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('retirar el consentimiento de salud', () => {
  it('bloquea las mediciones nuevas EN EL ACTO, antes de que corra ninguna purga', async () => {
    const socio = await altaSocio(gymA, tokenA, 'Bloqueo');
    await aceptar(gymA, tokenA, socio).expect(200);
    await medir(gymA, tokenA, socio, 70).expect(201);

    await retirar(gymA, tokenA, socio).expect(200);

    // Sin esperar a nada: la puerta del consentimiento ya no deja pasar.
    await medir(gymA, tokenA, socio, 71).expect(403);
  });

  it('encola la supresión EN EL ACTO, no la deja para las 04:00', async () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ ESTE TEST ES EL QUE SOSTIENE EL SLA DE 24 HORAS.                 │
     * │                                                                  │
     * │ Sin el encolado, el borrado dependeria de la hora a la que        │
     * │ alguien pulsara «retirar»: quien lo hiciera a las 04:05           │
     * │ esperaria casi un dia entero. Y como el trabajo se encola DENTRO  │
     * │ de la transaccion que revoca (patron outbox), o quedan las dos    │
     * │ cosas o no queda ninguna.                                         │
     * │                                                                  │
     * │ En los tests no hay consumidor —`onModuleInit` no registra        │
     * │ trabajadores con NODE_ENV=test— asi que el trabajo se queda en la │
     * │ cola, que es justo lo que permite verlo.                          │
     * └──────────────────────────────────────────────────────────────────┘
     */
    const socio = await altaSocio(gymA, tokenA, 'Encolada');
    await aceptar(gymA, tokenA, socio).expect(200);

    const cuantosTrabajos = async () => {
      const r = await owner.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM pgboss.job
            WHERE name = ${MAINTENANCE_QUEUES.supresionDeSalud}
              AND data->>'memberId' = ${socio}`,
      );
      return r.rows[0]!.n;
    };

    expect(await cuantosTrabajos(), 'aceptar no encola ninguna supresion').toBe(0);

    await retirar(gymA, tokenA, socio).expect(200);

    expect(await cuantosTrabajos(), 'retirar tiene que encolarla en el acto').toBe(1);
  });

  it('borra las mediciones Y SUS NOTAS, y deja la constancia sin IP', async () => {
    const socio = await altaSocio(gymA, tokenA, 'Purgado');
    await aceptar(gymA, tokenA, socio).expect(200);
    await medir(gymA, tokenA, socio, 72, 'nota con contenido de salud').expect(201);
    expect(await contarMediciones(gymA, socio)).toBe(1);

    // La IP se guarda al aceptar: es parte de la prueba mientras vale.
    const antes = await owner.execute<{ ip_address: string | null }>(
      sql`SELECT ip_address FROM consents
          WHERE gym_id = ${gymA}::uuid AND member_id = ${socio}::uuid`,
    );
    expect(antes.rows[0]!.ip_address).not.toBeNull();

    await retirar(gymA, tokenA, socio).expect(200);
    const r = await purgas.purgarDatosDeSalud();
    expect(r.mediciones).toBeGreaterThanOrEqual(1);

    expect(await contarMediciones(gymA, socio)).toBe(0);

    const despues = await owner.execute<{
      version: string;
      granted_at: Date;
      revoked_at: Date | null;
      ip_address: string | null;
    }>(
      sql`SELECT version, granted_at, revoked_at, ip_address FROM consents
          WHERE gym_id = ${gymA}::uuid AND member_id = ${socio}::uuid`,
    );

    // La constancia MINIMA: que version, cuando se acepto y cuando se retiro.
    const fila = despues.rows[0]!;
    expect(fila.version).toBe(VERSION);
    expect(fila.granted_at).toBeTruthy();
    expect(fila.revoked_at).toBeTruthy();
    // Y nada mas: la IP ya no hace falta para probar nada.
    expect(fila.ip_address).toBeNull();
  });

  it('NO toca los datos de otro gimnasio del mismo socio', async () => {
    /*
     * El caso que justifica que el consentimiento lleve `gym_id`. La misma
     * persona, dos gimnasios, y retira en uno. Si la purga cruzara la
     * frontera, el gimnasio B perderia datos que nadie le pidio borrar.
     */
    const enA = await altaSocio(gymA, tokenA, 'MultiA');
    const enB = await altaSocio(gymB, tokenB, 'MultiB');

    await aceptar(gymA, tokenA, enA).expect(200);
    await aceptar(gymB, tokenB, enB).expect(200);
    await medir(gymA, tokenA, enA, 80).expect(201);
    await medir(gymB, tokenB, enB, 80).expect(201);

    await retirar(gymA, tokenA, enA).expect(200);
    await purgas.purgarDatosDeSalud();

    expect(await contarMediciones(gymA, enA)).toBe(0);
    expect(await contarMediciones(gymB, enB), 'el gimnasio B no ha retirado nada').toBe(1);
  });

  it('NO borra si el socio vuelve a aceptar antes de que corra la purga', async () => {
    const socio = await altaSocio(gymA, tokenA, 'Arrepentida');
    await aceptar(gymA, tokenA, socio).expect(200);
    await medir(gymA, tokenA, socio, 65).expect(201);

    await retirar(gymA, tokenA, socio).expect(200);
    await aceptar(gymA, tokenA, socio).expect(200);

    await purgas.purgarDatosDeSalud();

    expect(await contarMediciones(gymA, socio), 'hay consentimiento vigente otra vez').toBe(1);
  });

  it('NO borra las de quien nunca retiro nada', async () => {
    const socio = await altaSocio(gymA, tokenA, 'Vigente');
    await aceptar(gymA, tokenA, socio).expect(200);
    await medir(gymA, tokenA, socio, 90).expect(201);

    await purgas.purgarDatosDeSalud();

    expect(await contarMediciones(gymA, socio)).toBe(1);
  });

  it('la constancia se va sola a los 3 años, y ni un dia antes', async () => {
    const socio = await altaSocio(gymA, tokenA, 'Caducada');
    await aceptar(gymA, tokenA, socio).expect(200);
    await retirar(gymA, tokenA, socio).expect(200);

    const cuantas = async () => {
      const r = await owner.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM consents
            WHERE gym_id = ${gymA}::uuid AND member_id = ${socio}::uuid`,
      );
      return r.rows[0]!.n;
    };

    // A un dia de cumplirlos: sigue.
    await envejecer(
      sql`UPDATE consents SET revoked_at = now() - interval '3 years' + interval '1 day'
          WHERE gym_id = ${gymA}::uuid AND member_id = ${socio}::uuid`,
    );
    await purgas.purgarDatosDeSalud();
    expect(await cuantas(), 'todavia no ha cumplido los 3 años').toBe(1);

    // Un dia despues: se va.
    await envejecer(
      sql`UPDATE consents SET revoked_at = now() - interval '3 years' - interval '1 day'
          WHERE gym_id = ${gymA}::uuid AND member_id = ${socio}::uuid`,
    );
    await purgas.purgarDatosDeSalud();
    expect(await cuantas()).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('auth_events — 12 meses', () => {
  it('borra los caducados y conserva los recientes', async () => {
    const viejo = `viejo-${sufijo}@test.local`;
    const nuevo = `nuevo-${sufijo}@test.local`;

    await owner.execute(
      sql`INSERT INTO auth_events (event_type, email_attempted, ip_address, created_at)
          VALUES ('login_failure', ${viejo}, '10.0.0.1',
                  now() - ${`${RETENCION.authEventsDias} days`}::interval - interval '1 day'),
                 ('login_failure', ${nuevo}, '10.0.0.2',
                  now() - ${`${RETENCION.authEventsDias} days`}::interval + interval '1 day')`,
    );

    await purgas.purgar();

    const quedan = await owner.execute<{ email_attempted: string }>(
      sql`SELECT email_attempted FROM auth_events WHERE email_attempted LIKE ${`%${sufijo}%`}`,
    );
    const correos = quedan.rows.map((f) => f.email_attempted);
    expect(correos).not.toContain(viejo);
    expect(correos, 'el de hace 11 meses y pico no toca').toContain(nuevo);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('audit_log — 3 años', () => {
  it('borra lo caducado, conserva lo reciente', async () => {
    const contar = async () => {
      const r = await owner.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM audit_log WHERE gym_id = ${gymA}::uuid`,
      );
      return r.rows[0]!.n;
    };

    // Hay lineas de sobra de los tests anteriores: consentimientos, altas...
    const antes = await contar();
    expect(antes, 'los tests de arriba han dejado auditoria').toBeGreaterThan(0);

    // Se envejece SOLO la mitad, para poder afirmar las dos cosas.
    await envejecer(
      sql`UPDATE audit_log SET created_at = now() - interval '3 years' - interval '1 day'
          WHERE gym_id = ${gymA}::uuid
            AND id IN (SELECT id FROM audit_log WHERE gym_id = ${gymA}::uuid LIMIT ${Math.floor(antes / 2)})`,
    );

    const borradas = await purgas.purgarAuditoria();
    expect(borradas).toBe(Math.floor(antes / 2));
    expect(await contar()).toBe(antes - Math.floor(antes / 2));
  });

  it('y el rol de la aplicación NO puede borrar auditoría por su cuenta', async () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ ESTE TEST ES EL QUE JUSTIFICA LA FUNCION SECURITY DEFINER.       │
     * │                                                                  │
     * │ Si el rol de la aplicacion pudiera borrar `audit_log`, la funcion │
     * │ sobraria — y el registro dejaria de ser append-only, que es lo    │
     * │ que lo hace valer como registro.                                  │
     * └──────────────────────────────────────────────────────────────────┘
     */
    let fallo: unknown;
    try {
      await comoApp.execute(sql`DELETE FROM audit_log WHERE gym_id = ${gymA}::uuid`);
    } catch (e) {
      fallo = e;
    }
    expect(fallo, 'el rol de la aplicacion tenia que tener DELETE retirado').toBeTruthy();
    // Por CODIGO SQLSTATE, no por el texto: el mensaje de PostgreSQL viene
    // traducido segun la configuracion regional del servidor, y 42501 es
    // 'insufficient_privilege' en cualquier idioma.
    expect((fallo as { cause?: { code?: string } }).cause?.code).toBe('42501');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('invitations — 12 meses desde que se resuelven', () => {
  it('borra las resueltas hace más de un año y respeta las vivas', async () => {
    const pendiente = email('viva');
    const aceptada = email('aceptada');

    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenA))
      .send({ email: pendiente, role: 'receptionist' })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenA))
      .send({ email: aceptada, role: 'trainer' })
      .expect(201);

    // Una se acepto hace 13 meses; la otra sigue esperando.
    await envejecer(
      sql`UPDATE invitations SET accepted_at = now() - interval '13 months'
          WHERE gym_id = ${gymA}::uuid AND email = ${aceptada}`,
    );

    const borradas = await purgas.purgarInvitaciones();
    expect(borradas).toBeGreaterThanOrEqual(1);

    const quedan = await owner.execute<{ email: string }>(
      sql`SELECT email FROM invitations WHERE gym_id = ${gymA}::uuid`,
    );
    const correos = quedan.rows.map((f) => f.email);
    expect(correos).not.toContain(aceptada);
    expect(correos, 'una invitacion pendiente sigue sirviendo').toContain(pendiente);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('la pasada completa', () => {
  it('es idempotente: la segunda vez no encuentra nada que borrar', async () => {
    await purgas.purgarTodo();
    const segunda = await purgas.purgarTodo();

    expect(segunda.authEvents).toBe(0);
    expect(segunda.auditLog).toBe(0);
    expect(segunda.invitations).toBe(0);
    expect(segunda.mediciones).toBe(0);
    expect(segunda.constanciasMinimizadas).toBe(0);
    expect(segunda.constanciasBorradas).toBe(0);
  });

  it('devuelve solo numeros: un registro de purgas no guarda datos personales', async () => {
    const r = await purgas.purgarTodo();
    for (const [clave, valor] of Object.entries(r)) {
      expect(typeof valor, `${clave} deberia ser un numero`).toBe('number');
    }
  });
});
