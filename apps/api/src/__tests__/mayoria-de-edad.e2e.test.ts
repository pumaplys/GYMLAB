/**
 * RINDA V1 ES SOLO PARA MAYORES DE 18.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PRUEBAN LAS DOS CAPAS, PORQUE SON DOS REDES Y NO UN DUPLICADO.       │
 * │                                                                          │
 * │   · el CONTRATO —`birthDateSchema`, compartido por API, panel y movil—   │
 * │     da el mensaje comprensible y cubre los tres flujos que escriben la   │
 * │     fecha: alta, edicion y perfil propio;                                 │
 * │   · la RESTRICCION de la base es el suelo: una semilla, un guion de       │
 * │     migracion o un endpoint futuro no pasan por ningun Zod, y ahi no hay │
 * │     forma de saltarsela.                                                  │
 * │                                                                          │
 * │ Probar solo la primera dejaria el suelo sin comprobar; probar solo la    │
 * │ segunda no diria nada del mensaje que lee una persona.                    │
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
  createMemberSchema,
  updateMemberSchema,
  updateOwnProfileSchema,
  EDAD_MINIMA,
  tieneEdadMinima,
} from '@gymlab/contracts';
import { closeDatabase, createDatabase, sql, type Database } from '@gymlab/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { env } from '../config/env';

let app: INestApplication;
let owner: Database;
let http: () => request.Agent;

const sufijo = randomUUID().slice(0, 8);
const correo = (quien: string) => `${quien}-${sufijo}@test.local`;
const PASSWORD = 'contrasena-larga-1';
const conSesion = (token: string) => ({ Authorization: `Bearer ${token}` });

let gymId: string;
let token: string;

/** Una fecha de nacimiento a `anios` años y `dias` días de hoy, en AAAA-MM-DD. */
function nacidoHace(anios: number, dias = 0): string {
  const hoy = new Date();
  const d = new Date(
    Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate() - dias),
  );
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.init();
  http = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  owner = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 2 });

  const alta = await http()
    .post('/v1/auth/register-gym')
    .send({
      organizationName: 'Edad',
      gymName: 'Edad',
      ownerName: 'Duena',
      email: correo('owner'),
      password: PASSWORD,
      platformCode: env.PLATFORM_INVITE_CODE,
    })
    .expect(201);
  token = alta.body.token;
  gymId = alta.body.activeGymId;
});

afterAll(async () => {
  await app?.close();
  if (!owner) return;
  const orgs = await owner.execute<{ organization_id: string }>(
    sql`SELECT DISTINCT organization_id FROM gyms WHERE id = ${gymId}::uuid`,
  );
  await owner.execute(sql`DELETE FROM invitations WHERE gym_id = ${gymId}::uuid`);
  await owner.execute(sql`DELETE FROM audit_log WHERE gym_id = ${gymId}::uuid`);
  await owner.execute(sql`DELETE FROM memberships WHERE gym_id = ${gymId}::uuid`);
  await owner.execute(sql`DELETE FROM gyms WHERE id = ${gymId}::uuid`);
  if (orgs.rows.length > 0) {
    const ids = sql.raw(orgs.rows.map((o) => `'${o.organization_id}'::uuid`).join(','));
    await owner.execute(sql`DELETE FROM organizations WHERE id IN (${ids})`);
  }
  await owner.execute(sql`DELETE FROM users WHERE email LIKE ${`%-${sufijo}@test.local`}`);
  await closeDatabase(owner);
});

describe('el contrato de la fecha de nacimiento', () => {
  const casos: { nombre: string; fecha: string; vale: boolean }[] = [
    { nombre: '17 años y 364 días', fecha: nacidoHace(17, 364), vale: false },
    { nombre: 'justo 18 años hoy', fecha: nacidoHace(18), vale: true },
    { nombre: 'un día antes de los 18', fecha: nacidoHace(18, -1), vale: false },
    { nombre: 'adulta de 35', fecha: nacidoHace(35), vale: true },
    { nombre: 'en el futuro', fecha: nacidoHace(-1), vale: false },
    { nombre: 'antes de 1900', fecha: '1899-12-31', vale: false },
    { nombre: 'formato inválido', fecha: '31-12-1990', vale: false },
    { nombre: 'mes inexistente', fecha: '1990-13-01', vale: false },
  ];

  for (const { nombre, fecha, vale } of casos) {
    it(`${nombre} → ${vale ? 'se acepta' : 'se rechaza'}`, () => {
      const r = createMemberSchema.safeParse({ firstName: 'A', lastName: 'B', birthDate: fecha });
      expect(r.success, `${fecha}`).toBe(vale);
    });
  }

  it('la fecha sigue siendo opcional: sin ella se puede dar de alta', () => {
    expect(createMemberSchema.safeParse({ firstName: 'A', lastName: 'B' }).success).toBe(true);
  });

  /*
   * Los otros dos flujos que escriben la fecha. Si la regla viviera en el
   * endpoint de alta en vez de en el esquema, estos dos se la saltarian.
   */
  it('editar la ficha tampoco deja meter a un menor', () => {
    expect(updateMemberSchema.safeParse({ birthDate: nacidoHace(15) }).success).toBe(false);
  });

  it('ni el propio socio cambiándose la fecha', () => {
    expect(updateOwnProfileSchema.safeParse({ birthDate: nacidoHace(15) }).success).toBe(false);
  });

  it('y el mensaje dice por qué, en castellano y sin jerga', () => {
    const r = createMemberSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      birthDate: nacidoHace(16),
    });
    expect(r.success).toBe(false);
    const mensajes = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(mensajes.join(' ')).toContain(`mayores de ${EDAD_MINIMA} años`);
    // Y NO el mensaje genérico, que confundiría a quien la escribió bien.
    expect(mensajes.join(' ')).not.toContain('no verosimil');
  });

  /*
   * El 29 de febrero, que es donde se rompe restar milisegundos: si el calculo
   * perdiera los bisiestos, esta persona seria mayor de edad un dia antes o un
   * dia despues de lo que dice el calendario.
   */
  it('quien nació un 29 de febrero cumple 18 el día que le toca', () => {
    expect(tieneEdadMinima('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toBe(false);
    expect(tieneEdadMinima('2008-02-29', new Date('2026-03-01T12:00:00Z'))).toBe(true);
  });
});

describe('la API rechaza al menor, y la base es el suelo', () => {
  it('dar de alta a alguien de 17 devuelve 400 y no crea nada', async () => {
    const antes = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM members WHERE gym_id = ${gymId}::uuid`,
    );

    const r = await http()
      .post(`/v1/gyms/${gymId}/members`)
      .set(conSesion(token))
      .send({ firstName: 'Menor', lastName: 'Prueba', birthDate: nacidoHace(17) })
      .expect(400);

    expect(JSON.stringify(r.body)).toContain(`mayores de ${EDAD_MINIMA} años`);

    const despues = await owner.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM members WHERE gym_id = ${gymId}::uuid`,
    );
    expect(despues.rows[0]!.n).toBe(antes.rows[0]!.n);
  });

  it('con 18 exactos sí se da de alta', async () => {
    await http()
      .post(`/v1/gyms/${gymId}/members`)
      .set(conSesion(token))
      .send({ firstName: 'Justa', lastName: 'Edad', birthDate: nacidoHace(18) })
      .expect(201);
  });

  it('y la restricción de la base rechaza incluso saltándose la API', async () => {
    /*
     * Escribiendo directo en la tabla, sin pasar por Zod. Es el camino de una
     * semilla o de un guion de migracion de datos, y es justo lo que el
     * contrato NO puede cubrir.
     */
    let fallo: unknown;
    try {
      await owner.execute(sql`
        INSERT INTO members (gym_id, member_number, first_name, last_name, birth_date)
        VALUES (${gymId}::uuid, 99998, 'Colada', 'Directa', ${nacidoHace(16)}::date)`);
    } catch (e) {
      fallo = e;
    }

    expect(fallo, 'la base tenía que rechazarlo').toBeTruthy();
    /*
     * El nombre de la restriccion viaja en la CAUSA: drizzle envuelve el error
     * de PostgreSQL con su propio «Failed query». Mirar solo el mensaje de
     * arriba daria verde con cualquier fallo de SQL —una tabla mal escrita,
     * por ejemplo— y eso no probaria nada.
     */
    const causa = (fallo as { cause?: { constraint?: string } }).cause;
    expect(causa?.constraint).toBe('members_mayoria_de_edad');
  });

  it('la restricción existe y es NOT VALID, para no romper datos heredados', async () => {
    const r = await owner.execute<{ convalidated: boolean }>(
      sql`SELECT convalidated FROM pg_constraint WHERE conname = 'members_mayoria_de_edad'`,
    );
    expect(r.rows[0], 'la restricción debería existir').toBeTruthy();
    expect(r.rows[0]!.convalidated, 'NOT VALID: no recorre lo ya existente').toBe(false);
  });
});
