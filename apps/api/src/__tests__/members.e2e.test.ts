/**
 * TESTS FUNCIONALES DEL MODULO DE SOCIOS
 *
 * Levantan la aplicacion completa contra un PostgreSQL real. El foco no es el
 * camino feliz, sino el abuso: permisos, salto entre gimnasios, concurrencia y
 * la diferencia entre dar de baja y borrar.
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
import { AppModule } from '../app.module';
import { patchRequestContext, runWithRequestContext } from '../common/request-context';
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';
import { MembersService } from '../members/members.service';

let app: INestApplication;
let owner: Database;
let http: () => request.Agent;

const sufijo = randomUUID().slice(0, 8);
const email = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const inicio = new Date();

let gymA: string;
let tokenOwnerA: string;
let tokenRecepcionA: string;
let tokenEntrenadorA: string;
let gymB: string;
let tokenOwnerB: string;
/** Id del dueño de A: lo necesita el test que llama al servicio directamente. */
let usuarioOwnerA: string;

const gimnasiosCreados: string[] = [];
const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

async function tokenEncolado(cola: string, destinatario: string): Promise<string> {
  const res = await owner.execute<{ data: { token: string } }>(
    sql`SELECT data FROM pgboss.job WHERE name = ${cola} AND data->>'to' = ${destinatario}
        ORDER BY created_on DESC LIMIT 1`,
  );
  const token = res.rows[0]?.data?.token;
  if (!token) throw new Error(`Sin trabajo "${cola}" para ${destinatario}`);
  return token;
}

/** Crea un gimnasio con su dueno y devuelve token y id. */
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

/** Da de alta a alguien del personal aceptando una invitacion. */
async function altaPersonal(gymId: string, tokenOwner: string, rol: string, quien: string) {
  await http()
    .post(`/v1/gyms/${gymId}/invitations`)
    .set(conSesion(tokenOwner))
    .send({ email: email(quien), role: rol })
    .expect(201);

  const res = await http()
    .post('/v1/auth/accept-invitation')
    .send({
      token: await tokenEncolado(EMAIL_QUEUES.invitation, email(quien)),
      name: quien,
      password: PASSWORD,
    })
    .expect(201);
  return res.body.token as string;
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
  tokenEntrenadorA = await altaPersonal(gymA, tokenOwnerA, 'trainer', 'entrenador-a');

  const fila = await owner.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${email('owner-a')}`,
  );
  usuarioOwnerA = fila.rows[0]!.id;
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
    for (const t of ['member_notes', 'members', 'member_counters', 'invitations', 'audit_log', 'memberships']) {
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
  // Cerrar el pool: cada fichero de test abre el suyo, y sin esto las conexiones
  // se acumulan durante toda la bateria contra la misma base de datos.
  await closeDatabase(owner);
});

/** Da de alta un socio y devuelve su cuerpo. */
async function altaSocio(token: string, gymId: string, datos: Record<string, unknown>) {
  const res = await http()
    .post(`/v1/gyms/${gymId}/members`)
    .set(conSesion(token))
    .send(datos)
    .expect(201);
  return res.body;
}

describe('alta de socios', () => {
  it('recepcion puede dar de alta a alguien SIN email ni cuenta', async () => {
    // Es la decision que ordena el modulo: la senora que va a aquagym y no
    // instala ninguna app tiene que poder existir.
    const socio = await altaSocio(tokenRecepcionA, gymA, {
      firstName: 'Carmen',
      lastName: 'SinCuenta',
    });

    expect(socio.email).toBeNull();
    expect(socio.hasAccount).toBe(false);
    expect(socio.status).toBe('active');
    expect(socio.memberNumber).toBeGreaterThan(0);
  });

  it('los numeros de socio son consecutivos dentro del gimnasio', async () => {
    const uno = await altaSocio(tokenOwnerA, gymA, { firstName: 'A', lastName: 'Consecutivo1' });
    const dos = await altaSocio(tokenOwnerA, gymA, { firstName: 'B', lastName: 'Consecutivo2' });

    expect(dos.memberNumber).toBe(uno.memberNumber + 1);
  });

  it('20 altas SIMULTANEAS producen 20 numeros distintos', async () => {
    // ESTE ES EL TEST DE CONCURRENCIA. Dos personas en el mostrador dando de
    // alta a la vez: con `SELECT max()+1` obtendrian el mismo numero.
    //
    // Se ejerce el SERVICIO, no el endpoint, y a proposito. La atomicidad del
    // contador es una propiedad de la base de datos; hacerla pasar por toda la
    // pila HTTP mezclaba lo que se quiere medir con el comportamiento del
    // servidor bajo 20 conexiones simultaneas — que en un runner lento produce
    // sockets reseteados y un fallo que no tiene nada que ver con el contador.
    //
    // El camino HTTP ya lo cubre el test de arriba; aqui se mide solo el
    // contador, y con mas presion de la que aguantaria el transporte.
    const service = app.get(MembersService);
    const db = app.get<Database>(DATABASE);

    const numeros = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        runWithRequestContext(async () =>
          withTenant(
            db,
            gymA,
            async (tx) => {
              // `sessionId` incluido porque `requireRequestContext()` lo exige:
              // es su forma de distinguir una ruta autenticada de una llamada
              // fuera del ciclo HTTP. Aqui simulamos la primera.
              patchRequestContext({
                tx,
                userId: usuarioOwnerA,
                gymId: gymA,
                sessionId: randomUUID(),
                role: 'owner',
                isPlatformAdmin: false,
              });
              const socio = await service.create(gymA, {
                firstName: 'Simultaneo',
                lastName: `N${i}`,
              });
              return socio.memberNumber;
            },
            { userId: usuarioOwnerA },
          ),
        ),
      ),
    );

    expect(numeros).toHaveLength(20);
    // Lo que de verdad se comprueba: ni un numero repetido.
    expect(new Set(numeros).size).toBe(20);
  });

  it('altas simultaneas por HTTP tambien reciben numeros distintos', async () => {
    // El camino completo, con paralelismo moderado: suficiente para cubrir el
    // endpoint sin convertir el transporte en la variable dominante.
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        http()
          .post(`/v1/gyms/${gymA}/members`)
          .set(conSesion(tokenRecepcionA))
          .send({ firstName: 'HttpSimultaneo', lastName: `N${i}` })
          .then((r) => r.body.memberNumber as number),
      ),
    );

    expect(new Set(respuestas).size).toBe(5);
  });

  it('cada gimnasio numera desde su propio 1', async () => {
    const enB = await altaSocio(tokenOwnerB, gymB, { firstName: 'Primero', lastName: 'DeB' });
    expect(enB.memberNumber).toBe(1);
  });

  it('rechaza datos no validos', async () => {
    const casos = [
      { firstName: '', lastName: 'Vacio' },
      { firstName: 'Ana', lastName: 'MalEmail', email: 'no-es-un-email' },
      { firstName: 'Ana', lastName: 'Futuro', birthDate: '2999-01-01' },
      { firstName: 'Ana', lastName: 'MalFecha', birthDate: '01-01-1990' },
      { firstName: 'Ana', lastName: 'MalTelefono', phone: 'llamame' },
    ];
    for (const caso of casos) {
      await http()
        .post(`/v1/gyms/${gymA}/members`)
        .set(conSesion(tokenOwnerA))
        .send(caso)
        .expect(400);
    }
  });

  it('no admite dos socios activos con el mismo email', async () => {
    const repetido = email('socio-repetido');
    await altaSocio(tokenOwnerA, gymA, { firstName: 'Uno', lastName: 'Repe', email: repetido });

    await http()
      .post(`/v1/gyms/${gymA}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ firstName: 'Dos', lastName: 'Repe', email: repetido })
      .expect(400);
  });
});

describe('permisos', () => {
  it('el entrenador NO accede al listado de socios', async () => {
    // Decision tomada: sin acceso hasta que existan las asignaciones. Darle
    // acceso a todos "provisionalmente" es de esas cosas que se quedan.
    await http()
      .get(`/v1/gyms/${gymA}/members`)
      .set(conSesion(tokenEntrenadorA))
      .expect(403);
  });

  it('recepcion NO puede exportar ni borrar', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Ana', lastName: 'Protegida' });

    await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}/export`)
      .set(conSesion(tokenRecepcionA))
      .expect(403);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenRecepcionA))
      .expect(403);
  });

  it('sin sesion no se llega a nada', async () => {
    await http().get(`/v1/gyms/${gymA}/members`).expect(401);
  });

  it('no se accede a socios de otro gimnasio cambiando el id de la ruta', async () => {
    await http()
      .get(`/v1/gyms/${gymB}/members`)
      .set(conSesion(tokenOwnerA))
      .expect(403);
  });

  it('una ficha de otro gimnasio responde 404, no la expone', async () => {
    const enB = await altaSocio(tokenOwnerB, gymB, { firstName: 'Oculto', lastName: 'DeB' });

    // Con el gymId propio en la ruta y el id ajeno: RLS no lo encuentra.
    await http()
      .get(`/v1/gyms/${gymA}/members/${enB.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(404);
  });
});

describe('listado y busqueda', () => {
  it('busca por apellido, por email y por numero de socio', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, {
      firstName: 'Buscable',
      lastName: 'Apellidoraro',
      email: email('buscable'),
    });

    for (const q of ['Apellidoraro', email('buscable'), String(socio.memberNumber)]) {
      const res = await http()
        .get(`/v1/gyms/${gymA}/members`)
        .query({ q })
        .set(conSesion(tokenOwnerA))
        .expect(200);
      expect(res.body.items.some((m: { id: string }) => m.id === socio.id)).toBe(true);
    }
  });

  it('pagina y devuelve el total', async () => {
    const res = await http()
      .get(`/v1/gyms/${gymA}/members`)
      .query({ page: 1, pageSize: 2 })
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBeGreaterThan(2);
    expect(res.body.pageSize).toBe(2);
  });

  it('el listado de un gimnasio nunca incluye socios del otro', async () => {
    const res = await http()
      .get(`/v1/gyms/${gymB}/members`)
      .query({ pageSize: 100 })
      .set(conSesion(tokenOwnerB))
      .expect(200);

    expect(res.body.items.every((m: { lastName: string }) => m.lastName.endsWith('DeB'))).toBe(true);
  });
});

describe('baja y reactivacion', () => {
  it('dar de baja NO borra: conserva la ficha con su fecha', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Baja', lastName: 'Temporal' });

    const baja = await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/deactivate`)
      .set(conSesion(tokenRecepcionA))
      .expect(201);

    expect(baja.body.status).toBe('inactive');
    expect(baja.body.leftAt).not.toBeNull();

    // La ficha sigue consultable: el gimnasio necesita el historial.
    const ficha = await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(ficha.body.firstName).toBe('Baja');
  });

  it('no se puede dar de baja dos veces', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Doble', lastName: 'Baja' });
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(400);
  });

  it('tras una baja, su email queda libre y luego se puede reactivar', async () => {
    const correo = email('email-liberado');
    const primero = await altaSocio(tokenOwnerA, gymA, {
      firstName: 'Primero',
      lastName: 'Libera',
      email: correo,
    });

    await http()
      .post(`/v1/gyms/${gymA}/members/${primero.id}/deactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(201);

    // El indice unico es parcial: solo cubre socios activos.
    const segundo = await altaSocio(tokenOwnerA, gymA, {
      firstName: 'Segundo',
      lastName: 'Libera',
      email: correo,
    });
    expect(segundo.id).not.toBe(primero.id);

    // Y reactivar al primero ya no es posible: ese email esta ocupado.
    await http()
      .post(`/v1/gyms/${gymA}/members/${primero.id}/reactivate`)
      .set(conSesion(tokenOwnerA))
      .expect(400);
  });
});

describe('notas internas', () => {
  it('se guardan con su autor y el socio no las ve en su ficha', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Con', lastName: 'Notas' });

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/notes`)
      .set(conSesion(tokenRecepcionA))
      .send({ body: 'Prefiere entrenar por la manana' })
      .expect(201);

    const notas = await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}/notes`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(notas.body).toHaveLength(1);
    expect(notas.body[0].authorUserId).not.toBeNull();

    // La ficha que devuelve la API no incluye notas por ningun camino.
    const ficha = await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);
    expect(JSON.stringify(ficha.body)).not.toContain('manana');
  });
});

describe('RGPD', () => {
  it('la exportacion incluye la ficha Y las notas internas', async () => {
    // Las notas no se ven en el producto, pero ante una solicitud formal de
    // acceso son datos personales que conciernen a esa persona. Consecuencia
    // practica: una nota interna no es secreta.
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Export', lastName: 'Able' });
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/notes`)
      .set(conSesion(tokenOwnerA))
      .send({ body: 'Nota que debe aparecer en la exportacion' })
      .expect(201);

    const res = await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(res.body.ficha.firstName).toBe('Export');
    expect(res.body.notasInternas).toHaveLength(1);
    expect(res.body.notasInternas[0].body).toContain('debe aparecer');
  });

  it('el borrado elimina de verdad la ficha y sus notas', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Borrar', lastName: 'Del' });
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/notes`)
      .set(conSesion(tokenOwnerA))
      .send({ body: 'Desaparecera con la ficha' })
      .expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(404);

    const quedan = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM member_notes WHERE member_id = ${socio.id}::uuid`,
    );
    expect(quedan.rows[0]!.n).toBe(0);
  });

  it('la auditoria del borrado no conserva datos personales', async () => {
    // Un registro de auditoria que guardara el nombre convertiria la auditoria
    // en una copia de lo que se acaba de borrar.
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Anonimo', lastName: 'Auditado' });
    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const filas = await owner.execute<{ metadata: unknown }>(
      sql`SELECT metadata FROM audit_log WHERE action = 'member.erased' AND entity_id = ${socio.id}::uuid`,
    );
    expect(filas.rows).toHaveLength(1);
    expect(JSON.stringify(filas.rows[0]!.metadata)).not.toContain('Anonimo');
  });

  it('la auditoria de una edicion guarda los campos, no los valores', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Edit', lastName: 'Auditado' });
    await http()
      .patch(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .send({ phone: '600111222' })
      .expect(200);

    const filas = await owner.execute<{ metadata: unknown }>(
      sql`SELECT metadata FROM audit_log WHERE action = 'member.updated' AND entity_id = ${socio.id}::uuid`,
    );
    const texto = JSON.stringify(filas.rows[0]!.metadata);
    expect(texto).toContain('phone');
    expect(texto).not.toContain('600111222');
  });
});

describe('el socio y sus propios datos', () => {
  it('un socio con cuenta ve su ficha y puede cambiar su telefono', async () => {
    // Se da de alta como socio a alguien que acepta invitacion: asi tiene cuenta.
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-propio');
    const yo = await owner.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email('socio-propio')}`,
    );
    await owner.execute(
      sql`INSERT INTO members (gym_id, user_id, member_number, first_name, last_name)
          VALUES (${gymA}::uuid, ${yo.rows[0]!.id}::uuid,
                  (SELECT coalesce(max(member_number),0) + 500 FROM members WHERE gym_id = ${gymA}::uuid),
                  'Propio', 'Perfil')`,
    );

    const ficha = await http()
      .get('/v1/me/member-profile')
      .set(conSesion(tokenSocio))
      .expect(200);
    expect(ficha.body.firstName).toBe('Propio');
    expect(ficha.body.hasAccount).toBe(true);

    await http()
      .patch('/v1/me/member-profile')
      .set(conSesion(tokenSocio))
      .send({ phone: '600999888' })
      .expect(200);

    // No puede cambiar su nombre por esta via: es dato de contrato.
    await http()
      .patch('/v1/me/member-profile')
      .set(conSesion(tokenSocio))
      .send({ firstName: 'Otro' })
      .expect(400);
  });

  it('un socio no puede listar ni ver fichas ajenas', async () => {
    const tokenSocio = await altaPersonal(gymA, tokenOwnerA, 'member', 'socio-curioso');
    const ajeno = await altaSocio(tokenOwnerA, gymA, { firstName: 'Ajeno', lastName: 'Privado' });

    await http().get(`/v1/gyms/${gymA}/members`).set(conSesion(tokenSocio)).expect(403);
    await http()
      .get(`/v1/gyms/${gymA}/members/${ajeno.id}`)
      .set(conSesion(tokenSocio))
      .expect(403);
  });
});

/**
 * LA EXPORTACION TIENE QUE TRAER LO QUE GUARDAN LOS DEMAS MODULOS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE ESTE BLOQUE EXISTE.                                              │
 * │                                                                          │
 * │ `PersonalDataModule` ya avisaba por escrito de que un modulo con datos   │
 * │ personales que no se registrara dejaria la exportacion incompleta "y     │
 * │ nadie recibira ningun error". Paso exactamente eso: progreso, accesos y  │
 * │ rutinas existian y no estaban en la lista, asi que una solicitud del     │
 * │ art. 15 se respondia sin los datos de SALUD.                             │
 * │                                                                          │
 * │ La guarda de arranque no lo detecta: comprueba que la lista no este      │
 * │ vacia, y con `billing` dentro no lo estaba. Estas pruebas son las que    │
 * │ faltaban — piden un dato concreto de cada modulo.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
/** La version del texto de salud sale de la configuracion, no del cliente. */
/**
 * La version tiene que EXISTIR COMO PLANTILLA, no basta con nombrarla: sin texto
 * sembrado no hay documento que publicar y el gate falla en cerrado. Es la que
 * siembra la migracion 0014.
 */
const VERSION_SALUD = '2026-09-01-borrador';
(env as { HEALTH_CONSENT_VERSION?: string }).HEALTH_CONSENT_VERSION = VERSION_SALUD;

/** Un ejercicio cualquiera de la biblioteca que el alta del gimnasio ya siembra. */
async function unEjercicio(gymId: string, token: string): Promise<string> {
  const lista = await http()
    .get(`/v1/gyms/${gymId}/exercises`)
    .set(conSesion(token))
    .expect(200);
  return lista.body[0].id as string;
}

describe('RGPD · la exportacion no deja fuera ningun modulo', () => {
  it('incluye las mediciones corporales y sus consentimientos (art. 9)', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Salud', lastName: 'Exportada' });

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/health-consent`)
      .set(conSesion(tokenOwnerA))
      .send({ version: VERSION_SALUD })
      .expect(200);

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/progress`)
      .set(conSesion(tokenOwnerA))
      .send({ weightKg: 74.5, waistCm: 81 })
      .expect(201);

    const res = await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(res.body.progresoYConsentimientos.mediciones).toHaveLength(1);
    expect(Number(res.body.progresoYConsentimientos.mediciones[0].pesoKg)).toBe(74.5);
    expect(res.body.progresoYConsentimientos.consentimientos).toHaveLength(1);
    expect(res.body.progresoYConsentimientos.consentimientos[0].version).toBe(VERSION_SALUD);
  });

  it('incluye las rutinas asignadas, SIN decir quien las asigno', async () => {
    // El nombre del entrenador es dato de otra persona: art. 15.4.
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Rutina', lastName: 'Exportada' });

    const ejercicio = await unEjercicio(gymA, tokenOwnerA);
    const rutina = await http()
      .post(`/v1/gyms/${gymA}/routines`)
      .set(conSesion(tokenOwnerA))
      .send({
        name: 'Fuerza basica',
        description: 'Tres dias',
        items: [{ exerciseId: ejercicio, sets: 4, reps: '8-10' }],
      })
      .expect(201);

    await http()
      .post(`/v1/gyms/${gymA}/routines/${rutina.body.id}/members`)
      .set(conSesion(tokenOwnerA))
      .send({ memberId: socio.id })
      .expect(201);

    const res = await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(res.body.rutinasAsignadas).toHaveLength(1);
    expect(res.body.rutinasAsignadas[0].rutina).toBe('Fuerza basica');
    expect(JSON.stringify(res.body.rutinasAsignadas)).not.toContain('TrainerId');
    expect(JSON.stringify(res.body.rutinasAsignadas)).not.toContain('assignedBy');
  });

  it('trae la seccion de accesos aunque el socio no haya entrado nunca', async () => {
    // Una lista vacia es una respuesta correcta y frecuente. Lo que no puede
    // pasar es que la seccion no exista: quien recibe la entrega no sabria si
    // es que no hay accesos o es que no se los han dado.
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Sin', lastName: 'Accesos' });

    const res = await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(res.body.accesos).toEqual([]);
  });

  it('la entrega trae todas las secciones, con un socio recien dado de alta', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Todas', lastName: 'Secciones' });

    const res = await http()
      .get(`/v1/gyms/${gymA}/members/${socio.id}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    for (const seccion of [
      'ficha',
      'notasInternas',
      'cuotasYPagos',
      'progresoYConsentimientos',
      'accesos',
      'rutinasAsignadas',
    ]) {
      expect(res.body, `falta la seccion "${seccion}"`).toHaveProperty(seccion);
    }
  });

  it('no exporta un socio de otro gimnasio', async () => {
    const enB = await altaSocio(tokenOwnerB, gymB, { firstName: 'Ajeno', lastName: 'DeB' });

    await http()
      .get(`/v1/gyms/${gymA}/members/${enB.id}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(404);
  });

  it('exportar un socio inexistente responde 404, no 500', async () => {
    await http()
      .get(`/v1/gyms/${gymA}/members/${randomUUID()}/export`)
      .set(conSesion(tokenOwnerA))
      .expect(404);
  });
});

describe('RGPD · que se lleva por delante el borrado', () => {
  it('borra progreso y consentimientos, y anonimiza los pagos', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Con', lastName: 'Historial' });

    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/health-consent`)
      .set(conSesion(tokenOwnerA))
      .send({ version: VERSION_SALUD })
      .expect(200);
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/progress`)
      .set(conSesion(tokenOwnerA))
      .send({ weightKg: 70 })
      .expect(201);

    const plan = await http()
      .post(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenOwnerA))
      .send({ name: `Plan borrado ${sufijo}`, priceCents: 3000, period: 'monthly' })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: plan.body.id })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/payments`)
      .set(conSesion(tokenOwnerA))
      .send({ concept: 'subscription', amountCents: 3000, method: 'cash' })
      .expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    // Datos personales y de salud: fuera.
    const salud = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM body_metrics WHERE member_id = ${socio.id}::uuid`,
    );
    expect(salud.rows[0]!.n).toBe(0);

    const permisos = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM consents WHERE member_id = ${socio.id}::uuid`,
    );
    expect(permisos.rows[0]!.n).toBe(0);

    const cuotas = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM member_subscriptions WHERE member_id = ${socio.id}::uuid`,
    );
    expect(cuotas.rows[0]!.n).toBe(0);

    /*
     * El pago NO se borra: se le quita el socio.
     *
     * Un gimnasio tiene obligacion de conservar sus registros contables, y esa
     * obligacion convive con el derecho al olvido — el art. 17.3.b lo permite
     * expresamente. La forma de cumplir las dos es que el cobro siga cuadrando
     * la caja sin decir de quien era. Por eso la clave ajena es SET NULL y no
     * CASCADE: si fuera cascada, borrar a una persona descuadraria el ejercicio.
     */
    const pagos = await owner.execute<{ n: number; huerfanos: number }>(
      sql`SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE member_id IS NULL)::int AS huerfanos
          FROM payments WHERE gym_id = ${gymA}::uuid AND amount_cents = 3000`,
    );
    expect(pagos.rows[0]!.n).toBeGreaterThan(0);
    expect(pagos.rows[0]!.huerfanos).toBe(pagos.rows[0]!.n);
  });

  it('no borra un socio de otro gimnasio', async () => {
    const enB = await altaSocio(tokenOwnerB, gymB, { firstName: 'Intocable', lastName: 'DeB' });

    await http()
      .delete(`/v1/gyms/${gymA}/members/${enB.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(404);

    // Y sigue ahi.
    await http()
      .get(`/v1/gyms/${gymB}/members/${enB.id}`)
      .set(conSesion(tokenOwnerB))
      .expect(200);
  });

  it('borrar un socio inexistente responde 404, no 500', async () => {
    await http()
      .delete(`/v1/gyms/${gymA}/members/${randomUUID()}`)
      .set(conSesion(tokenOwnerA))
      .expect(404);
  });

});

/**
 * QUE PASA CON LA CUENTA Y LA PERTENENCIA AL BORRAR UNA FICHA.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL AGUJERO QUE CIERRAN ESTAS PRUEBAS.                                    │
 * │                                                                          │
 * │ Las claves ajenas resuelven el art. 17 para todo lo que APUNTA a         │
 * │ `members`. `memberships` no apunta ahi —apunta a `users` y a `gyms`— asi │
 * │ que ninguna cascada la tocaba: la persona seguia perteneciendo al        │
 * │ gimnasio despues de que su ficha desapareciera, y lo seguia viendo en su │
 * │ selector con un 404 en todo.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('RGPD · identidad tras el borrado', () => {
  /** Cuantas pertenencias vivas tiene esa cuenta, en cualquier gimnasio. */
  async function pertenenciasDe(correo: string): Promise<number> {
    const filas = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM memberships m
          JOIN users u ON u.id = m.user_id
          WHERE u.email = ${correo}`,
    );
    return filas.rows[0]!.n;
  }

  async function existeCuenta(correo: string): Promise<boolean> {
    const filas = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM users WHERE email = ${correo}`,
    );
    return filas.rows[0]!.n > 0;
  }

  /** Da de alta un socio CON cuenta: ficha, invitacion y aceptacion. */
  async function socioConCuenta(gymId: string, tokenStaff: string, quien: string) {
    const socio = await altaSocio(tokenStaff, gymId, {
      firstName: 'Socio',
      lastName: quien,
      email: email(quien),
    });
    await http()
      .post(`/v1/gyms/${gymId}/members/${socio.id}/invite`)
      .set(conSesion(tokenStaff))
      .expect(201);
    const res = await http()
      .post('/v1/auth/accept-invitation')
      .send({
        token: await tokenEncolado(EMAIL_QUEUES.invitation, email(quien)),
        name: quien,
        password: PASSWORD,
      })
      .expect(201);
    return { socio, token: res.body.token as string };
  }

  it('un socio SIN cuenta se borra sin tocar ninguna identidad', async () => {
    const socio = await altaSocio(tokenOwnerA, gymA, { firstName: 'Sin', lastName: 'Cuenta' });
    const antes = await owner.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users`);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const despues = await owner.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users`);
    expect(despues.rows[0]!.n).toBe(antes.rows[0]!.n);
  });

  it('con cuenta y una sola pertenencia: desaparecen la pertenencia Y la cuenta', async () => {
    const quien = 'socio-unico';
    const { socio } = await socioConCuenta(gymA, tokenOwnerA, quien);
    expect(await pertenenciasDe(email(quien))).toBe(1);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    expect(await pertenenciasDe(email(quien))).toBe(0);
    // Sin pertenencias, sin perfil de entrenador y sin invitaciones emitidas, la
    // cuenta no tiene ninguna finalidad dentro de GYMLAB.
    expect(await existeCuenta(email(quien))).toBe(false);
  });

  it('borrar en un gimnasio NO afecta a la ficha ni a la cuenta en el otro', async () => {
    const quien = 'socio-en-dos';
    const { socio: enA, token } = await socioConCuenta(gymA, tokenOwnerA, quien);

    // La MISMA persona, socia tambien de B: se le invita desde su ficha en B y
    // acepta con la sesion ya abierta, que es el flujo de vincular (ADR-0010).
    const enB = await altaSocio(tokenOwnerB, gymB, {
      firstName: 'Socio',
      lastName: quien,
      email: email(quien),
    });
    await http()
      .post(`/v1/gyms/${gymB}/members/${enB.id}/invite`)
      .set(conSesion(tokenOwnerB))
      .expect(201);
    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(token))
      .send({ token: await tokenEncolado(EMAIL_QUEUES.invitation, email(quien)) })
      .expect(201);

    expect(await pertenenciasDe(email(quien))).toBe(2);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${enA.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    // Queda la de B, y la cuenta sigue viva porque le queda una finalidad.
    expect(await pertenenciasDe(email(quien))).toBe(1);
    expect(await existeCuenta(email(quien))).toBe(true);

    // Y su ficha en B sigue intacta: el otro gimnasio no ha pedido nada.
    await http()
      .get(`/v1/gyms/${gymB}/members/${enB.id}`)
      .set(conSesion(tokenOwnerB))
      .expect(200);
  });

  it('el gimnasio borrado deja de aparecerle a esa persona', async () => {
    const quien = 'socio-que-deja-de-ver';
    const { socio, token } = await socioConCuenta(gymA, tokenOwnerA, quien);

    const antes = await http().get('/v1/auth/me').set(conSesion(token)).expect(200);
    expect(antes.body.memberships.map((m: { gymId: string }) => m.gymId)).toContain(gymA);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    // La cuenta se ha ido con la ultima pertenencia, asi que su sesion ya no
    // vale: `sessions` cae en cascada al borrar `users`. Es el resultado
    // correcto — no puede quedar navegando por un gimnasio que le olvido.
    await http().get('/v1/auth/me').set(conSesion(token)).expect(401);
  });

  /**
   * DOS ROLES EN EL MISMO GIMNASIO NO SON REPRESENTABLES, y conviene saberlo.
   *
   * Se intento probar "recepcion que ademas es socia del gimnasio donde
   * trabaja" y no se puede montar: invitar devuelve 400 con "Esa persona ya
   * pertenece al gimnasio", y ademas hay un indice unico parcial sobre
   * `(gym_id, user_id) WHERE ended_at IS NULL`. Una cuenta tiene como mucho UNA
   * pertenencia viva por gimnasio.
   *
   * El caso real equivalente es este: trabajar en un gimnasio y ser socio de
   * OTRO. Prueba lo mismo —que borrar la ficha de socio no toca el puesto ni la
   * cuenta— con un escenario que si existe.
   */
  it('quien trabaja en un gimnasio y es socio de otro conserva cuenta y puesto', async () => {
    const quien = 'entrenador-y-socio';
    const tokenStaff = await altaPersonal(gymA, tokenOwnerA, 'trainer', quien);
    expect(await pertenenciasDe(email(quien))).toBe(1);

    const ficha = await altaSocio(tokenOwnerB, gymB, {
      firstName: 'Entrenador',
      lastName: 'Y Socio',
      email: email(quien),
    });
    await http()
      .post(`/v1/gyms/${gymB}/members/${ficha.id}/invite`)
      .set(conSesion(tokenOwnerB))
      .expect(201);
    await http()
      .post('/v1/auth/link-invitation')
      .set(conSesion(tokenStaff))
      .send({ token: await tokenEncolado(EMAIL_QUEUES.invitation, email(quien)) })
      .expect(201);
    expect(await pertenenciasDe(email(quien))).toBe(2);

    await http()
      .delete(`/v1/gyms/${gymB}/members/${ficha.id}`)
      .set(conSesion(tokenOwnerB))
      .expect(200);

    // Se va la de socio en B; queda la de entrenador en A, y la cuenta con ella.
    expect(await pertenenciasDe(email(quien))).toBe(1);
    expect(await existeCuenta(email(quien))).toBe(true);
    const roles = await owner.execute<{ role: string }>(
      sql`SELECT m.role FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE u.email = ${email(quien)}`,
    );
    expect(roles.rows.map((r) => r.role)).toEqual(['trainer']);

    // Y sigue pudiendo trabajar donde trabajaba.
    await http().get('/v1/me/trainer').set(conSesion(tokenStaff)).expect(200);
  });

  it('la operacion no deja estado a medias: o todo o nada', async () => {
    // La ficha y la pertenencia se van en la MISMA transaccion. Se comprueba
    // consultando las dos despues de una sola llamada: si el hook corriera
    // fuera de la transaccion, una de las dos podria sobrevivir.
    const quien = 'socio-atomico';
    const { socio } = await socioConCuenta(gymA, tokenOwnerA, quien);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const restos = await owner.execute<{ fichas: number; pertenencias: number }>(
      sql`SELECT
            (SELECT count(*)::int FROM members WHERE id = ${socio.id}::uuid) AS fichas,
            (SELECT count(*)::int FROM memberships m JOIN users u ON u.id = m.user_id
              WHERE u.email = ${email(quien)}) AS pertenencias`,
    );
    expect(restos.rows[0]!.fichas).toBe(0);
    expect(restos.rows[0]!.pertenencias).toBe(0);
  });

  it('los pagos sobreviven al borrado de la cuenta, desvinculados', async () => {
    const quien = 'socio-con-pagos';
    const { socio } = await socioConCuenta(gymA, tokenOwnerA, quien);

    const plan = await http()
      .post(`/v1/gyms/${gymA}/plans`)
      .set(conSesion(tokenOwnerA))
      .send({ name: `Plan identidad ${sufijo}`, priceCents: 4100, period: 'monthly' })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/subscription`)
      .set(conSesion(tokenOwnerA))
      .send({ planId: plan.body.id })
      .expect(201);
    await http()
      .post(`/v1/gyms/${gymA}/members/${socio.id}/payments`)
      .set(conSesion(tokenOwnerA))
      .send({ concept: 'subscription', amountCents: 4100, method: 'card' })
      .expect(201);

    await http()
      .delete(`/v1/gyms/${gymA}/members/${socio.id}`)
      .set(conSesion(tokenOwnerA))
      .expect(200);

    const pagos = await owner.execute<{ n: number; sinSocio: number }>(
      sql`SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE member_id IS NULL)::int AS "sinSocio"
          FROM payments WHERE gym_id = ${gymA}::uuid AND amount_cents = 4100`,
    );
    expect(pagos.rows[0]!.n).toBe(1);
    expect(pagos.rows[0]!.sinSocio).toBe(1);
  });
});
