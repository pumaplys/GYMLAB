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
