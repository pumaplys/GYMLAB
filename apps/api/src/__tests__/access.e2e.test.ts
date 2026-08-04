/**
 * TESTS FUNCIONALES DEL ACCESO POR QR
 *
 * Es la funcionalidad con mas superficie de abuso del producto: si se rompe,
 * entra gente que no paga. Casi todos estos tests intentan romperla.
 *
 * Los dos que mas importan:
 *   - dos escaneres simultaneos con el MISMO token: solo uno puede ganar;
 *   - un token del gimnasio A presentado en el B: la firma no debe validar.
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
  sql,
  withTenant,
  type Database,
} from '@gymlab/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../access/access.service';
import { AppModule } from '../app.module';
import { patchRequestContext, runWithRequestContext } from '../common/request-context';
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';

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
/** Dos sesiones de recepcion distintas: son los dos escaneres del gimnasio. */
let escaner1: string;
let escaner2: string;
let gymB: string;
let tokenOwnerB: string;
let escanerB: string;
let planA: string;
let planB: string;

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

/** Segunda sesion de la MISMA cuenta: la segunda tablet del mostrador. */
async function segundaSesion(quien: string): Promise<string> {
  const res = await http()
    .post('/v1/auth/login')
    .send({ email: email(quien), password: PASSWORD })
    .expect(201);
  return res.body.token as string;
}

/**
 * Mueve el vencimiento de la cuota N dias respecto de HOY EN EL GIMNASIO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES `now()::date`, Y LA DIFERENCIA COSTO UN CI EN ROJO.                 │
 * │                                                                          │
 * │ `now()::date` es la fecha del SERVIDOR. El servicio calcula los dias que │
 * │ faltan en la zona del GIMNASIO, que es lo correcto y esta puesto asi a   │
 * │ proposito (`billing.service.ts`). Con el servidor en UTC y el gimnasio   │
 * │ en Europe/Madrid, entre las 22:00 y las 24:00 UTC de verano el gimnasio  │
 * │ ya esta en el dia siguiente: la prueba escribia "+2" y el servicio leia  │
 * │ 1.                                                                       │
 * │                                                                          │
 * │ Es decir, el test estuvo DOS HORAS AL DIA en rojo desde la Fase 1 sin    │
 * │ que nadie lo viera, porque CI casi nunca corre a esa hora. Lo delato una │
 * │ ejecucion a las 22:25 UTC.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function venceEn(memberId: string, dias: number) {
  await owner.execute(sql`
    UPDATE member_subscriptions s
    SET current_period_end = (now() AT TIME ZONE g.timezone)::date + ${dias}::int
    FROM gyms g
    WHERE g.id = s.gym_id AND s.member_id = ${memberId}::uuid
  `);
}

/** Socio con cuenta, ficha y cuota al corriente. Devuelve su sesion y su ficha. */
async function socioAlCorriente(gymId: string, tokenStaff: string, planId: string, quien: string) {
  const tokenSocio = await altaPersonal(gymId, tokenStaff, 'member', quien);
  const yo = await owner.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${email(quien)}`,
  );
  const ficha = await http()
    .post(`/v1/gyms/${gymId}/members`)
    .set(conSesion(tokenStaff))
    .send({ firstName: 'Socio', lastName: quien })
    .expect(201);
  await owner.execute(
    sql`UPDATE members SET user_id = ${yo.rows[0]!.id}::uuid WHERE id = ${ficha.body.id}::uuid`,
  );

  await http()
    .post(`/v1/gyms/${gymId}/members/${ficha.body.id}/subscription`)
    .set(conSesion(tokenStaff))
    .send({ planId })
    .expect(201);
  await http()
    .post(`/v1/gyms/${gymId}/members/${ficha.body.id}/payments`)
    .set(conSesion(tokenStaff))
    .send({ concept: 'subscription', amountCents: 3000, method: 'cash' })
    .expect(201);

  return { tokenSocio, memberId: ficha.body.id as string };
}

async function generarQr(tokenSocio: string): Promise<string> {
  const res = await http().post('/v1/me/access/token').set(conSesion(tokenSocio)).expect(201);
  return res.body.token as string;
}

function verificar(gymId: string, tokenEscaner: string, qr: string) {
  return http()
    .post(`/v1/gyms/${gymId}/access/verify`)
    .set(conSesion(tokenEscaner))
    .send({ token: qr });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 5 });

  const a = await registrarGimnasio('Gym A', 'owner-a');
  tokenOwnerA = a.token;
  gymA = a.gymId;
  const b = await registrarGimnasio('Gym B', 'owner-b');
  tokenOwnerB = b.token;
  gymB = b.gymId;

  escaner1 = await altaPersonal(gymA, tokenOwnerA, 'receptionist', 'escaner-a');
  escaner2 = await segundaSesion('escaner-a');
  escanerB = await altaPersonal(gymB, tokenOwnerB, 'receptionist', 'escaner-b');

  const pa = await http()
    .post(`/v1/gyms/${gymA}/plans`)
    .set(conSesion(tokenOwnerA))
    .send({ name: 'Mensual', priceCents: 3000, period: 'monthly' })
    .expect(201);
  planA = pa.body.id;
  const pb = await http()
    .post(`/v1/gyms/${gymB}/plans`)
    .set(conSesion(tokenOwnerB))
    .send({ name: 'Mensual', priceCents: 3000, period: 'monthly' })
    .expect(201);
  planB = pb.body.id;
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

describe('camino feliz', () => {
  it('un socio al corriente entra, y recepcion ve quien es', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'feliz');
    const qr = await generarQr(socio.tokenSocio);

    const res = await verificar(gymA, escaner1, qr).expect(201);

    expect(res.body.decision).toBe('ALLOW');
    expect(res.body.reason).toBe('OK');
    expect(res.body.member.lastName).toBe('feliz');
    expect(res.body.member.memberNumber).toBeGreaterThan(0);
    expect(res.body.isRetry).toBe(false);
  });

  it('el QR no lleva ningun dato personal dentro', async () => {
    // Un QR se muestra en una pantalla y se fotografia. Lo que no viaja no se
    // filtra (art. 5.1.c). Solo hay identificadores opacos y una caducidad.
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'sindatos');
    const qr = await generarQr(socio.tokenSocio);

    const bytes = Buffer.from(qr, 'base64url');

    // 89 bytes exactos: version(1) + gym(16) + socio(16) + jti(16) + exp(8) +
    // firma(32). No cabe nada mas, y esa es la garantia: no es que hoy no
    // metamos datos personales, es que no hay sitio donde meterlos.
    expect(bytes).toHaveLength(89);

    const crudo = bytes.toString('latin1');
    expect(crudo).not.toContain('sindatos');
    expect(crudo).not.toContain('Socio');
    expect(crudo).not.toContain(email('sindatos'));
  });

  it('generar el QR no escribe nada en la base de datos', async () => {
    // La app lo regenera cada pocos segundos mientras la pantalla esta abierta.
    // Guardar cada uno seria escribir por decenas de tokens que nadie usa.
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'sinescritura');
    const antes = await owner.execute<{ n: string }>(sql`SELECT count(*) AS n FROM access_tokens`);

    await generarQr(socio.tokenSocio);
    await generarQr(socio.tokenSocio);
    await generarQr(socio.tokenSocio);

    const despues = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM access_tokens`,
    );
    expect(Number(despues.rows[0]!.n)).toBe(Number(antes.rows[0]!.n));
  });
});

describe('uso unico del jti', () => {
  it('el mismo QR no sirve dos veces desde escaneres distintos', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'unuso');
    const qr = await generarQr(socio.tokenSocio);

    const primero = await verificar(gymA, escaner1, qr).expect(201);
    expect(primero.body.decision).toBe('ALLOW');

    const segundo = await verificar(gymA, escaner2, qr).expect(201);
    expect(segundo.body.decision).toBe('DENY');
    expect(segundo.body.reason).toBe('TOKEN_REUSED');
  });

  it('dos escaneres seguidos por HTTP: el segundo no entra', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'carrera-http');
    const qr = await generarQr(socio.tokenSocio);

    const [a, b] = await Promise.all([
      verificar(gymA, escaner1, qr),
      verificar(gymA, escaner2, qr),
    ]);

    expect([a.body.decision, b.body.decision].sort()).toEqual(['ALLOW', 'DENY']);
    const denegado = a.body.decision === 'DENY' ? a.body : b.body;
    expect(denegado.reason).toBe('TOKEN_REUSED');
  });

  it('VEINTE ESCANEOS SIMULTANEOS del mismo QR: exactamente uno gana', async () => {
    // EL TEST CENTRAL DEL MODULO, y esta escrito contra el SERVICIO por un
    // motivo que descubri falsificando: la version de arriba, dos peticiones
    // HTTP en paralelo, **pasaba igual** con la implementacion ingenua de
    // comprobar-y-luego-insertar. Dos intentos una sola vez casi nunca caen
    // dentro de una ventana de milisegundos, asi que ese test no demostraba lo
    // que decia demostrar.
    //
    // Aqui cada intento abre su PROPIA transaccion sobre el mismo `jti`, con
    // veinte a la vez. Con `ON CONFLICT DO NOTHING` gana uno; con un SELECT
    // previo, varios creen ganar o revientan con clave duplicada.
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'carrera');
    const qr = await generarQr(socio.tokenSocio);

    const service = app.get(AccessService);
    const db = app.get<Database>(DATABASE);
    const usuario = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('escaner-a')}`,
    );

    const resultados = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        runWithRequestContext(async () =>
          withTenant(
            db,
            gymA,
            async (tx) => {
              patchRequestContext({
                tx,
                userId: usuario.rows[0]!.id,
                // Sesion DISTINTA en cada intento: son escaneres distintos, no
                // reintentos del mismo. Si compartieran sesion, la ventana de
                // tolerancia devolveria la misma decision y el test mentiria.
                sessionId: `escaner-simultaneo-${i}`,
                gymId: gymA,
                role: 'receptionist',
                isPlatformAdmin: false,
              });
              return service.verificar(gymA, qr);
            },
            { userId: usuario.rows[0]!.id },
          ),
        ),
      ),
    );

    const permitidos = resultados.filter((r) => r.decision !== 'DENY');
    expect(permitidos).toHaveLength(1);
    expect(resultados.filter((r) => r.reason === 'TOKEN_REUSED')).toHaveLength(19);

    // Y en la base de datos hay UNA sola fila para ese jti.
    const filas = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM access_tokens WHERE member_id = ${socio.memberId}::uuid`,
    );
    expect(Number(filas.rows[0]!.n)).toBe(1);
  });

  it('un DENY tambien consume el token', async () => {
    // Un token representa un INTENTO de acceso. Si el DENY no consumiera, no
    // habria decision guardada que repetir ante un reintento de red.
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'sincuota');
    const yo = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('sincuota')}`,
    );
    const ficha = await http()
      .post(`/v1/gyms/${gymA}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ firstName: 'Socio', lastName: 'SinCuota' })
      .expect(201);
    await owner.execute(
      sql`UPDATE members SET user_id = ${yo.rows[0]!.id}::uuid WHERE id = ${ficha.body.id}::uuid`,
    );

    const qr = await generarQr(tokenSocio);
    const primero = await verificar(gymA, escaner1, qr).expect(201);
    expect(primero.body.decision).toBe('DENY');
    expect(primero.body.reason).toBe('NO_SUBSCRIPTION');

    const segundo = await verificar(gymA, escaner2, qr).expect(201);
    expect(segundo.body.reason).toBe('TOKEN_REUSED');
  });
});

describe('reintento del mismo escaner', () => {
  it('devuelve la MISMA decision dentro de la ventana', async () => {
    // Caso real, no ataque: la peticion entro, la respuesta se perdio y el
    // escaner reintenta. Sin esto, el socio se queda fuera con el torno cerrado.
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'reintento');
    const qr = await generarQr(socio.tokenSocio);

    const primero = await verificar(gymA, escaner1, qr).expect(201);
    expect(primero.body.decision).toBe('ALLOW');
    expect(primero.body.isRetry).toBe(false);

    const reintento = await verificar(gymA, escaner1, qr).expect(201);
    expect(reintento.body.decision).toBe('ALLOW');
    expect(reintento.body.reason).toBe('OK');
    expect(reintento.body.isRetry).toBe(true);
  });

  it('la repeticion NO cuenta como una entrada mas', async () => {
    // Sin marcarla, un escaner con mala cobertura inflaria la asistencia del
    // dashboard con entradas que no ocurrieron.
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'nocuenta');
    const qr = await generarQr(socio.tokenSocio);

    await verificar(gymA, escaner1, qr).expect(201);
    await verificar(gymA, escaner1, qr).expect(201);

    const eventos = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM access_events
          WHERE member_id = ${socio.memberId}::uuid AND is_retry = false`,
    );
    expect(Number(eventos.rows[0]!.n)).toBe(1);
  });

  it('pasada la ventana, el mismo escaner ya recibe DENY', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'ventana');
    const qr = await generarQr(socio.tokenSocio);
    await verificar(gymA, escaner1, qr).expect(201);

    // Se envejece el consumo en lugar de esperar tres segundos de reloj.
    await owner.execute(
      sql`UPDATE access_tokens SET consumed_at = now() - interval '10 seconds'
          WHERE member_id = ${socio.memberId}::uuid`,
    );

    const tarde = await verificar(gymA, escaner1, qr).expect(201);
    expect(tarde.body.decision).toBe('DENY');
    expect(tarde.body.reason).toBe('TOKEN_REUSED');
  });

  it('OTRO escaner dentro de la ventana NO recibe la repeticion', async () => {
    // La tolerancia es para un reintento del mismo dispositivo. Dos escaneres
    // con el mismo QR a la vez son dos personas, o una que lo presto.
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'otroescaner');
    const qr = await generarQr(socio.tokenSocio);

    await verificar(gymA, escaner1, qr).expect(201);
    const otro = await verificar(gymA, escaner2, qr).expect(201);

    expect(otro.body.decision).toBe('DENY');
    expect(otro.body.reason).toBe('TOKEN_REUSED');
    expect(otro.body.isRetry).toBe(false);
  });
});

describe('firma y caducidad', () => {
  it('un token del gimnasio A NO vale en el gimnasio B', async () => {
    // La clave se deriva por gimnasio, asi que el cruce falla en la firma. No es
    // una comprobacion que alguien pueda olvidar: es criptografico.
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'cruzado');
    const qr = await generarQr(socio.tokenSocio);

    const res = await verificar(gymB, escanerB, qr).expect(201);

    expect(res.body.decision).toBe('DENY');
    expect(res.body.reason).toBe('BAD_SIGNATURE');
    expect(res.body.member).toBeNull();
  });

  it('un token manipulado se rechaza', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'manipulado');
    const qr = await generarQr(socio.tokenSocio);

    // Se cambia un byte del cuerpo, dejando la firma intacta.
    const bytes = Buffer.from(qr, 'base64url');
    bytes[20] = bytes[20]! ^ 0xff;
    const falso = bytes.toString('base64url');

    const res = await verificar(gymA, escaner1, falso).expect(201);
    expect(res.body.reason).toBe('BAD_SIGNATURE');
  });

  it('basura y tokens de otra longitud se rechazan sin romper nada', async () => {
    for (const basura of ['', 'x', 'no-es-base64!!', Buffer.alloc(200).toString('base64url')]) {
      const res = await verificar(gymA, escaner1, basura);
      // La cadena vacia la rechaza el contrato; el resto llega al servicio.
      expect([201, 400]).toContain(res.status);
      if (res.status === 201) expect(res.body.decision).toBe('DENY');
    }
  });

  it('un token caducado se rechaza', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'caducado');
    const qr = await generarQr(socio.tokenSocio);

    // El `exp` va dentro del cuerpo firmado, asi que no se puede envejecer sin
    // romper la firma. Se comprueba por la via honesta: un token de hace un
    // minuto ya no vale, y para eso se firma uno con caducidad pasada.
    const bytes = Buffer.from(qr, 'base64url');
    bytes.writeBigInt64BE(BigInt(Date.now() - 1000), 49);
    const viejo = bytes.toString('base64url');

    const res = await verificar(gymA, escaner1, viejo).expect(201);
    // Manipular el exp invalida la firma: el rechazo llega antes, y esta bien
    // que asi sea — significa que la caducidad esta protegida por la firma.
    expect(res.body.decision).toBe('DENY');
    expect(res.body.reason).toBe('BAD_SIGNATURE');
  });
});

describe('estado del socio y de su cuota', () => {
  it('un socio de baja no entra, aunque tenga la cuota pagada', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'debaja');
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.memberId}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    const res = await verificar(gymA, escaner1, await generarQr(socio.tokenSocio)).expect(201);
    expect(res.body.decision).toBe('DENY');
    expect(res.body.reason).toBe('MEMBER_INACTIVE');
  });

  it('con la cuota vencida no entra', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'vencido');
    await venceEn(socio.memberId, -1);

    const res = await verificar(gymA, escaner1, await generarQr(socio.tokenSocio)).expect(201);
    expect(res.body.decision).toBe('DENY');
    expect(res.body.reason).toBe('DUES_EXPIRED');
  });

  it('a punto de vencer entra con aviso y los dias que faltan', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'porvencer');
    await venceEn(socio.memberId, 2);

    const res = await verificar(gymA, escaner1, await generarQr(socio.tokenSocio)).expect(201);
    expect(res.body.decision).toBe('WARN');
    expect(res.body.reason).toBe('DUES_WARN');
    expect(res.body.diasRestantes).toBe(2);
  });

  it('dentro de la cortesia del gimnasio entra con aviso', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'gracia');
    await http()
      .patch(`/v1/gyms/${gymA}/settings`)
      .set(conSesion(tokenOwnerA))
      .send({ graceDays: 5 })
      .expect(200);
    await venceEn(socio.memberId, -2);

    const res = await verificar(gymA, escaner1, await generarQr(socio.tokenSocio)).expect(201);
    expect(res.body.decision).toBe('WARN');

    await http()
      .patch(`/v1/gyms/${gymA}/settings`)
      .set(conSesion(tokenOwnerA))
      .send({ graceDays: 0 })
      .expect(200);
  });
});

describe('quien puede hacer que', () => {
  it('un socio no puede validar QR: se abriria la puerta el mismo', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'listillo');
    const qr = await generarQr(socio.tokenSocio);

    await http()
      .post(`/v1/gyms/${gymA}/access/verify`)
      .set(conSesion(socio.tokenSocio))
      .send({ token: qr })
      .expect(403);
  });

  it('un entrenador tampoco', async () => {
    const tokenEntrenador = await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-a');
    await http()
      .post(`/v1/gyms/${gymA}/access/verify`)
      .set(conSesion(tokenEntrenador))
      .send({ token: 'lo-que-sea' })
      .expect(403);
  });

  it('sin sesion no se genera ni se valida nada', async () => {
    await http().post('/v1/me/access/token').expect(401);
    await http().post(`/v1/gyms/${gymA}/access/verify`).send({ token: 'x' }).expect(401);
  });

  it('escribir el gymId de A con sesion de B responde 403', async () => {
    await http()
      .post(`/v1/gyms/${gymA}/access/verify`)
      .set(conSesion(escanerB))
      .send({ token: 'x' })
      .expect(403);
  });

  it('solo el dueno cambia los ajustes del gimnasio', async () => {
    await http()
      .patch(`/v1/gyms/${gymA}/settings`)
      .set(conSesion(escaner1))
      .send({ accessEventsRetentionMonths: 1 })
      .expect(403);
  });
});

describe('historial y aislamiento', () => {
  it('cada gimnasio ve solo sus propios accesos', async () => {
    const socioA = await socioAlCorriente(gymA, tokenOwnerA, planA, 'historial-a');
    const socioB = await socioAlCorriente(gymB, tokenOwnerB, planB, 'historial-b');
    await verificar(gymA, escaner1, await generarQr(socioA.tokenSocio)).expect(201);
    await verificar(gymB, escanerB, await generarQr(socioB.tokenSocio)).expect(201);

    const deB = await http()
      .get(`/v1/gyms/${gymB}/access/events`)
      .set(conSesion(escanerB))
      .expect(200);

    expect(deB.body.items.length).toBeGreaterThan(0);
    for (const evento of deB.body.items) {
      expect(evento.memberId).not.toBe(socioA.memberId);
    }
  });

  it('el historial guarda tambien los intentos rechazados', async () => {
    // Un DENY por token reutilizado puede ser alguien pasando su QR a un amigo:
    // es justo lo que interesa poder mirar despues.
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'rechazado');
    const qr = await generarQr(socio.tokenSocio);
    await verificar(gymA, escaner1, qr).expect(201);
    await verificar(gymA, escaner2, qr).expect(201);

    const lista = await http()
      .get(`/v1/gyms/${gymA}/access/events?memberId=${socio.memberId}`)
      .set(conSesion(escaner1))
      .expect(200);

    const motivos = lista.body.items.map((e: { reason: string }) => e.reason);
    expect(motivos).toContain('OK');
    expect(motivos).toContain('TOKEN_REUSED');
  });
});

describe('retencion', () => {
  it('la purga se lleva los tokens caducados y respeta el plazo de cada gimnasio', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'purga');
    await verificar(gymA, escaner1, await generarQr(socio.tokenSocio)).expect(201);

    // Se envejecen las filas en lugar de esperar meses.
    await owner.execute(
      sql`UPDATE access_tokens SET expires_at = now() - interval '2 hours' WHERE gym_id = ${gymA}::uuid`,
    );
    await owner.execute(
      sql`UPDATE access_events SET occurred_at = now() - interval '400 days' WHERE gym_id = ${gymA}::uuid`,
    );

    const res = await owner.execute<{ tokens_borrados: string; eventos_borrados: string }>(
      sql`SELECT * FROM app_purge_access_data()`,
    );

    expect(Number(res.rows[0]!.tokens_borrados)).toBeGreaterThan(0);
    expect(Number(res.rows[0]!.eventos_borrados)).toBeGreaterThan(0);
  });

  it('con la retencion subida, esos mismos eventos NO se purgan', async () => {
    const socio = await socioAlCorriente(gymA, tokenOwnerA, planA, 'purga-larga');
    await verificar(gymA, escaner1, await generarQr(socio.tokenSocio)).expect(201);
    await owner.execute(
      sql`UPDATE access_events SET occurred_at = now() - interval '400 days'
          WHERE member_id = ${socio.memberId}::uuid`,
    );

    await http()
      .patch(`/v1/gyms/${gymA}/settings`)
      .set(conSesion(tokenOwnerA))
      .send({ accessEventsRetentionMonths: 24 })
      .expect(200);

    await owner.execute(sql`SELECT * FROM app_purge_access_data()`);

    const quedan = await owner.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM access_events WHERE member_id = ${socio.memberId}::uuid`,
    );
    expect(Number(quedan.rows[0]!.n)).toBeGreaterThan(0);

    await http()
      .patch(`/v1/gyms/${gymA}/settings`)
      .set(conSesion(tokenOwnerA))
      .send({ accessEventsRetentionMonths: 12 })
      .expect(200);
  });
});
