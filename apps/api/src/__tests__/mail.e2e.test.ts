/**
 * TESTS DEL ENVIO DE CORREO
 *
 * Levantan la aplicacion con un transporte de correo falso que captura los
 * mensajes: se comprueba destinatario, asunto y contenido de verdad, sin llamar
 * a Resend.
 *
 * El foco esta en lo que puede fallar en silencio: que el enlace apunte donde
 * debe, que un error definitivo NO se reintente y que uno transitorio SI.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ROLES } from '@gymlab/contracts';
import { EMAIL_QUEUES, closeDatabase, createDatabase, sql, type Database } from '@gymlab/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { env } from '../config/env';
import { EmailWorker } from '../jobs/email.worker';
import { MAILER } from '../mail/mail.tokens';
import { MailError, type Mailer, type MailMessage } from '../mail/mailer';
import { renderizar } from '../mail/templates';

/** Transporte falso: guarda lo enviado y puede simular fallos. */
class MailerDePrueba implements Mailer {
  enviados: MailMessage[] = [];
  fallo: Error | null = null;

  async send(message: MailMessage): Promise<void> {
    if (this.fallo) throw this.fallo;
    this.enviados.push(message);
  }
}

let app: INestApplication;
let owner: Database;
let http: () => request.Agent;
let mailer: MailerDePrueba;
let worker: EmailWorker;

const sufijo = randomUUID().slice(0, 8);
const email = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const inicio = new Date();
const gimnasiosCreados: string[] = [];

let gymA: string;
let tokenOwnerA: string;

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Recupera el trabajo encolado para un destinatario. */
async function trabajoEncolado(cola: string, destinatario: string) {
  const res = await owner.execute<{ data: { to: string; token: string; url: string } }>(
    sql`SELECT data FROM pgboss.job WHERE name = ${cola} AND data->>'to' = ${destinatario}
        ORDER BY created_on DESC LIMIT 1`,
  );
  const data = res.rows[0]?.data;
  if (!data) throw new Error(`Sin trabajo "${cola}" para ${destinatario}`);
  return data;
}

beforeAll(async () => {
  mailer = new MailerDePrueba();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // Se sustituye el transporte real: los tests no llaman a Resend.
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  worker = app.get(EmailWorker);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 2 });

  const res = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: 'Gym Correo',
      gymName: 'Gym Correo',
      ownerName: 'Ana',
      email: email('owner'),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  tokenOwnerA = res.body.token;
  gymA = res.body.activeGymId;
  gimnasiosCreados.push(gymA);
});

beforeEach(() => {
  mailer.enviados = [];
  mailer.fallo = null;
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
    for (const t of ['invitations', 'audit_log', 'memberships']) {
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

describe('correo de invitacion', () => {
  it('se compone con asunto, enlace y version en texto plano', async () => {
    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('invitado'), role: 'member' })
      .expect(201);

    const job = await trabajoEncolado(EMAIL_QUEUES.invitation, email('invitado'));
    await worker.procesar(EMAIL_QUEUES.invitation, job);

    expect(mailer.enviados).toHaveLength(1);
    const correo = mailer.enviados[0]!;
    expect(correo.to).toBe(email('invitado'));
    expect(correo.subject).toContain('GYMLAB');
    // Texto plano obligatorio: hay clientes que bloquean el HTML, y un correo de
    // invitacion que llega vacio es alguien que no puede entrar.
    expect(correo.text).toContain(job.url);
    expect(correo.html).toContain(job.url);
    expect(correo.text.length).toBeGreaterThan(20);
  });

  it('el enlace apunta al PANEL WEB, no a la API', async () => {
    // Fallo real que este trabajo destapo: los enlaces llevaban a la API, una
    // URL sin interfaz donde no hay formulario que rellenar.
    await http()
      .post(`/v1/gyms/${gymA}/invitations`)
      .set(conSesion(tokenOwnerA))
      .send({ email: email('enlace'), role: 'member' })
      .expect(201);

    const job = await trabajoEncolado(EMAIL_QUEUES.invitation, email('enlace'));

    expect(job.url.startsWith(env.WEB_APP_URL)).toBe(true);
    expect(job.url).toContain('/accept-invitation?token=');
  });

  it('NINGUNA invitacion promete lo que todavia no existe', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ ESTE CORREO PROMETIA UNA APP MOVIL QUE NO EXISTE.                    │
    // │                                                                      │
    // │ El texto era el mismo para todos los roles y decia "podras consultar │
    // │ tus rutinas y tu progreso desde el movil". Se vio invitando a un     │
    // │ recepcionista REAL en produccion: es lo primero que lee alguien al   │
    // │ entrar en GYMLAB, y le prometia dos cosas que no le tocan y una app  │
    // │ que no esta escrita.                                                 │
    // │                                                                      │
    // │ Se comprueban los CUATRO roles y las dos partes del correo, HTML y   │
    // │ texto plano, porque la promesa vivia solo en el HTML y el texto      │
    // │ plano no la tenia: mirar una sola mitad no habria bastado.           │
    // └──────────────────────────────────────────────────────────────────────┘
    const PROHIBIDAS = [/rutina/i, /progreso/i, /\bmovil\b/i, /\bapp\b/i, /descarga/i];

    for (const role of ROLES) {
      const mensaje = renderizar(EMAIL_QUEUES.invitation, {
        to: 'quien.sea@ejemplo.test',
        token: 'tk',
        url: 'https://ejemplo.test/accept-invitation?token=tk',
        role,
      });

      for (const prohibida of PROHIBIDAS) {
        expect(mensaje.html, `el HTML de la invitacion de ${role} promete ${prohibida}`).not.toMatch(
          prohibida,
        );
        expect(mensaje.text, `el texto de la invitacion de ${role} promete ${prohibida}`).not.toMatch(
          prohibida,
        );
      }

      // Y que diga algo util: no vale vaciarlo para pasar el control.
      expect(mensaje.text.length).toBeGreaterThan(80);
    }
  });

  it('y cada rol lee lo que va a hacer de verdad', async () => {
    const recepcion = renderizar(EMAIL_QUEUES.invitation, {
      to: 'r@ejemplo.test',
      token: 'tk',
      url: 'https://ejemplo.test/x',
      role: 'receptionist',
    });
    const dueno = renderizar(EMAIL_QUEUES.invitation, {
      to: 'd@ejemplo.test',
      token: 'tk',
      url: 'https://ejemplo.test/x',
      role: 'owner',
    });

    expect(recepcion.text).toMatch(/socios/i);
    expect(recepcion.text).toMatch(/cobro|cuota/i);
    // Los precios son del dueno: al mostrador no se le anuncia que los fija.
    expect(recepcion.text).not.toMatch(/precio/i);
    expect(dueno.text).toMatch(/precio/i);
  });
});

describe('correo de restablecer contrasena', () => {
  it('avisa de que caduca, es de un solo uso y cierra las sesiones', async () => {
    await http().post('/v1/auth/forgot-password').send({ email: email('owner') }).expect(201);

    const job = await trabajoEncolado(EMAIL_QUEUES.resetPassword, email('owner'));
    await worker.procesar(EMAIL_QUEUES.resetPassword, job);

    const correo = mailer.enviados[0]!;
    expect(correo.subject.toLowerCase()).toContain('contrasena');
    // Quien recibe esto sin haberlo pedido tiene que saber que no hay nada que
    // hacer: su contrasena sigue intacta.
    expect(correo.text).toContain('no has pedido');
    expect(correo.text).toContain('sesiones');
    expect(correo.text).toContain(job.url);
  });

  it('el enlace apunta al panel web', async () => {
    await http().post('/v1/auth/forgot-password').send({ email: email('owner') }).expect(201);
    const job = await trabajoEncolado(EMAIL_QUEUES.resetPassword, email('owner'));
    expect(job.url.startsWith(env.WEB_APP_URL)).toBe(true);
  });
});

describe('errores y reintentos', () => {
  const jobDePrueba = { to: 'destino@test.local', token: 'tok', url: 'https://x/y' };

  it('un error TRANSITORIO se relanza para que pg-boss reintente', async () => {
    mailer.fallo = new MailError('limite de peticiones', true);

    await expect(worker.procesar(EMAIL_QUEUES.invitation, jobDePrueba)).rejects.toThrow(
      'limite de peticiones',
    );
  });

  it('un error DEFINITIVO no se relanza: reintentarlo no cambiaria nada', async () => {
    // Un email mal formado seguira mal formado dentro de una hora. Agotar cinco
    // reintentos solo llenaria el log de ruido y enterraria la causa.
    mailer.fallo = new MailError('validation_error: direccion no valida', false);

    await expect(worker.procesar(EMAIL_QUEUES.invitation, jobDePrueba)).resolves.toBeUndefined();
  });

  it('un error DESCONOCIDO se reintenta: es el lado seguro', async () => {
    // Perder un correo por no insistir es peor que insistir de mas.
    mailer.fallo = new Error('algo inesperado del proveedor');

    await expect(worker.procesar(EMAIL_QUEUES.invitation, jobDePrueba)).rejects.toThrow(
      'algo inesperado',
    );
  });

  it('una cola sin plantilla lanza en lugar de enviar un correo vacio', async () => {
    await expect(worker.procesar('email.inventada', jobDePrueba)).rejects.toThrow(
      /No hay plantilla/,
    );
  });
});

describe('politica de reintentos de las colas', () => {
  it('las colas de correo estan configuradas con reintentos y espera creciente', async () => {
    const res = await owner.execute<{
      name: string;
      retry_limit: number;
      retry_backoff: boolean;
    }>(sql`SELECT name, retry_limit, retry_backoff FROM pgboss.queue
           WHERE name LIKE 'email.%' ORDER BY name`);

    expect(res.rows.length).toBeGreaterThan(0);
    for (const fila of res.rows) {
      expect(fila.retry_limit, `${fila.name} sin reintentos`).toBeGreaterThan(1);
      expect(fila.retry_backoff, `${fila.name} sin espera creciente`).toBe(true);
    }
  });

  it('un trabajo no sobrevive al token que transporta', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LOS DOS PLAZOS DE pg-boss NO SON LO QUE PARECEN.                     │
    // │                                                                      │
    // │   expire_seconds     cuanto puede estar EN EJECUCION.                │
    // │   retention_seconds  cuanto puede estar ESPERANDO en la cola.        │
    // │                                                                      │
    // │ Estaba puesto `expireInSeconds: 12h` creyendo que limitaba la espera.│
    // │ No lo hacia: daba doce horas a una llamada HTTP. Y el que si la      │
    // │ limita estaba sin poner, con su valor por defecto de CATORCE DIAS.   │
    // │                                                                      │
    // │ Con el proceso caido un rato, un correo de recuperacion podia salir  │
    // │ dias despues con un enlace que murio en una hora. Quien lo abriera   │
    // │ leeria "el enlace no es valido" sin haber hecho nada mal.            │
    // └──────────────────────────────────────────────────────────────────────┘
    const res = await owner.execute<{
      name: string;
      retention_seconds: number;
      expire_seconds: number;
    }>(sql`SELECT name, retention_seconds, expire_seconds FROM pgboss.queue
           WHERE name LIKE 'email.%' ORDER BY name`);

    const porNombre = new Map(res.rows.map((f) => [f.name, f]));
    const UNA_HORA = 60 * 60;

    // Los tokens de recuperar y verificar duran una hora: la espera tiene que
    // quedar por debajo o el correo llega muerto.
    for (const cola of [EMAIL_QUEUES.resetPassword, EMAIL_QUEUES.verifyEmail]) {
      const fila = porNombre.get(cola)!;
      expect(fila.retention_seconds, `${cola} espera mas que su token`).toBeLessThan(UNA_HORA);
      // Y por encima de los ~31 min de reintentos, o se borraria a mitad.
      expect(fila.retention_seconds, `${cola} no da tiempo a reintentar`).toBeGreaterThan(35 * 60);
    }

    // La invitacion dura 7 dias, asi que aqui la espera no es la restriccion.
    expect(porNombre.get(EMAIL_QUEUES.invitation)!.retention_seconds).toBeGreaterThan(UNA_HORA);

    // Y enviar un correo es una llamada HTTP: si tarda minutos, esta colgada.
    for (const fila of res.rows) {
      expect(fila.expire_seconds, `${fila.name} tarda demasiado en darse por colgada`).toBeLessThan(
        10 * 60,
      );
    }
  });
});
