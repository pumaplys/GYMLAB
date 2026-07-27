/**
 * TEST DE AISLAMIENTO ENTRE TENANTS
 *
 * Es el test mas importante del proyecto. Bloquea el merge.
 *
 * Una fuga de datos entre gimnasios no es un bug: es el final del producto.
 * Ningun cliente vuelve despues de ver los socios de otro gimnasio, y en la UE
 * es ademas una brecha de datos de salud notificable.
 *
 * Corre contra un PostgreSQL real, no contra un mock. Un mock de RLS solo
 * probaria que el mock funciona.
 *
 * Requiere:
 *   docker compose up -d
 *   pnpm db:migrate
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../client';
import { auditLog, authEvents, gyms, invitations, memberships, organizations, users } from '../schema';
import { withTenant, withoutTenant } from '../tenant';

/** Conexion propietaria: siembra los datos saltandose RLS. Solo para el test. */
let owner: Database;
/** Conexion de la aplicacion: es la que debe quedar aislada. */
let app: Database;

const gymA = randomUUID();
const gymB = randomUUID();
const orgA = randomUUID();
const orgB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();

beforeAll(async () => {
  const ownerUrl = process.env.DATABASE_URL;
  const appUrl = process.env.DATABASE_URL_APP;

  if (!ownerUrl || !appUrl) {
    throw new Error('El test necesita DATABASE_URL y DATABASE_URL_APP.');
  }

  owner = createDatabase({ connectionString: ownerUrl, max: 2 });
  app = createDatabase({ connectionString: appUrl, max: 2 });

  // Dos gimnasios de organizaciones distintas, cada uno con un usuario.
  await owner.insert(organizations).values([
    { id: orgA, name: 'Org A' },
    { id: orgB, name: 'Org B' },
  ]);
  await owner.insert(gyms).values([
    { id: gymA, organizationId: orgA, name: 'Gym A', slug: `a-${gymA.slice(0, 8)}` },
    { id: gymB, organizationId: orgB, name: 'Gym B', slug: `b-${gymB.slice(0, 8)}` },
  ]);
  await owner.insert(users).values([
    { id: userA, email: `a-${userA.slice(0, 8)}@test.local`, name: 'Ana' },
    { id: userB, email: `b-${userB.slice(0, 8)}@test.local`, name: 'Berta' },
  ]);
  await owner.insert(memberships).values([
    { gymId: gymA, userId: userA, role: 'owner' },
    { gymId: gymB, userId: userB, role: 'owner' },
  ]);
});

afterAll(async () => {
  if (!owner) return;
  await owner.delete(memberships).where(sql`gym_id in (${gymA}, ${gymB})`);
  await owner.delete(gyms).where(sql`id in (${gymA}, ${gymB})`);
  await owner.delete(organizations).where(sql`id in (${orgA}, ${orgB})`);
  await owner.delete(users).where(sql`id in (${userA}, ${userB})`);
});

describe('la conexion de la aplicacion no puede saltarse RLS', () => {
  it('no es superusuario ni tiene BYPASSRLS', async () => {
    // Si esto falla, TODOS los demas tests de este archivo son falsos positivos:
    // pasarian aunque no existiera ni una sola politica.
    const result = await app.execute<{ is_superuser: boolean; bypasses_rls: boolean }>(sql`
      SELECT rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
      FROM pg_roles WHERE rolname = current_user
    `);

    expect(result.rows[0]?.is_superuser).toBe(false);
    expect(result.rows[0]?.bypasses_rls).toBe(false);
  });

  it('la jerarquia del tenant tiene RLS', async () => {
    // gyms y organizations no llevan gym_id: son el tenant en si, y sus
    // politicas comparan contra `id`. Por eso van comprobadas por nombre.
    const result = await app.execute<{ relname: string; relrowsecurity: boolean }>(sql`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relname IN ('gyms', 'organizations')
    `);

    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.relrowsecurity, `RLS desactivado en ${row.relname}`).toBe(true);
    }
  });

  it('TODA tabla con gym_id tiene RLS y al menos una politica', async () => {
    // Guardarrail para el futuro, y el motivo por el que este test no enumera
    // tablas a mano: la lista crecera con members, subscriptions, routines,
    // body_metrics, access_events... Si alguien anade una tabla con gym_id y
    // olvida su bloque en sql/01-rls.sql, esto se pone en rojo en el PR en
    // lugar de descubrirse en produccion con datos de clientes reales.
    const result = await owner.execute<{
      tabla: string;
      rls: boolean;
      politicas: number;
    }>(sql`
      SELECT c.relname AS tabla,
             c.relrowsecurity AS rls,
             (SELECT count(*) FROM pg_policies p
               WHERE p.schemaname = n.nspname AND p.tablename = c.relname)::int AS politicas
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = n.nspname
            AND col.table_name = c.relname
            AND col.column_name = 'gym_id'
        )
      ORDER BY c.relname
    `);

    // Si esto falla, el propio test se ha quedado sin objeto: nadie tiene gym_id.
    expect(result.rows.length).toBeGreaterThan(0);

    for (const row of result.rows) {
      expect(row.rls, `${row.tabla} tiene gym_id pero RLS esta desactivado`).toBe(true);
      expect(
        row.politicas,
        `${row.tabla} tiene RLS pero ninguna politica: no filtra nada`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('lectura', () => {
  it('dentro del gimnasio A solo se ven las membresias de A', async () => {
    const rows = await withTenant(app, gymA, (tx) => tx.select().from(memberships));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.gymId).toBe(gymA);
  });

  it('dentro del gimnasio B solo se ven las membresias de B', async () => {
    const rows = await withTenant(app, gymB, (tx) => tx.select().from(memberships));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.gymId).toBe(gymB);
  });

  it('un SELECT sin filtro NO devuelve datos de otros gimnasios', async () => {
    // Este es el caso que motiva toda la decision de RLS: el `WHERE gym_id`
    // olvidado. Con RLS, olvidarlo es inofensivo.
    const rows = await withTenant(app, gymA, (tx) => tx.select().from(memberships));

    expect(rows.every((r) => r.gymId === gymA)).toBe(true);
  });

  it('solo es visible el propio gimnasio y su organizacion', async () => {
    const visibles = await withTenant(app, gymA, async (tx) => ({
      gyms: await tx.select().from(gyms),
      orgs: await tx.select().from(organizations),
    }));

    expect(visibles.gyms).toHaveLength(1);
    expect(visibles.gyms[0]?.id).toBe(gymA);
    expect(visibles.orgs).toHaveLength(1);
    expect(visibles.orgs[0]?.id).toBe(orgA);
  });

  it('sin contexto de tenant no se ve nada — falla en cerrado', async () => {
    const rows = await withoutTenant(app, (tx) => tx.select().from(memberships));

    expect(rows).toHaveLength(0);
  });
});

describe('escritura', () => {
  it('no se puede insertar una fila en otro gimnasio', async () => {
    // WITH CHECK impide que, estando en A, se escriba una fila marcada como B.
    await expect(
      withTenant(app, gymA, (tx) =>
        tx.insert(memberships).values({ gymId: gymB, userId: userB, role: 'member' }),
      ),
    ).rejects.toThrow();
  });

  it('un UPDATE sin filtro no toca filas de otro gimnasio', async () => {
    await withTenant(app, gymA, (tx) => tx.update(memberships).set({ role: 'receptionist' }));

    const enB = await withTenant(app, gymB, (tx) => tx.select().from(memberships));
    expect(enB[0]?.role).toBe('owner');

    await withTenant(app, gymA, (tx) => tx.update(memberships).set({ role: 'owner' }));
  });

  it('un DELETE sin filtro no borra filas de otro gimnasio', async () => {
    await withTenant(app, gymA, (tx) => tx.delete(memberships));

    const enB = await withTenant(app, gymB, (tx) => tx.select().from(memberships));
    expect(enB).toHaveLength(1);

    await owner.insert(memberships).values({ gymId: gymA, userId: userA, role: 'owner' });
  });
});

describe('tablas del modulo auth', () => {
  it('las invitaciones estan aisladas por gimnasio', async () => {
    const idA = randomUUID();
    const idB = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await owner.insert(invitations).values([
      {
        id: idA,
        gymId: gymA,
        email: 'invitado@a.test',
        role: 'member',
        tokenHash: `hash-${idA}`,
        invitedByUserId: userA,
        expiresAt,
      },
      {
        id: idB,
        gymId: gymB,
        email: 'invitado@b.test',
        role: 'member',
        tokenHash: `hash-${idB}`,
        invitedByUserId: userB,
        expiresAt,
      },
    ]);

    const enA = await withTenant(app, gymA, (tx) => tx.select().from(invitations));
    expect(enA).toHaveLength(1);
    expect(enA[0]?.gymId).toBe(gymA);

    await owner.delete(invitations).where(sql`id in (${idA}, ${idB})`);
  });

  it('audit_log es append-only: la aplicacion no puede modificarlo ni borrarlo', async () => {
    // Un registro de auditoria que la propia aplicacion puede reescribir no
    // sirve como registro de auditoria. Aqui lo impide Postgres, no el codigo.
    const id = randomUUID();
    await withTenant(app, gymA, (tx) =>
      tx.insert(auditLog).values({ id, gymId: gymA, actorUserId: userA, action: 'test.accion' }),
    );

    await expect(
      withTenant(app, gymA, (tx) => tx.update(auditLog).set({ action: 'manipulada' })),
    ).rejects.toThrow();

    await expect(withTenant(app, gymA, (tx) => tx.delete(auditLog))).rejects.toThrow();

    const filas = await withTenant(app, gymA, (tx) => tx.select().from(auditLog));
    expect(filas).toHaveLength(1);
    expect(filas[0]?.action).toBe('test.accion');

    await owner.delete(auditLog).where(sql`id = ${id}`);
  });

  it('auth_events es global: se lee sin contexto de tenant', async () => {
    // Un login fallido no tiene gimnasio. Si esta tabla llevara RLS, seria
    // invisible justo para el dueno que quiere ver si le estan atacando.
    const id = randomUUID();
    await owner.insert(authEvents).values({
      id,
      emailAttempted: 'desconocido@test.local',
      eventType: 'login_failure',
    });

    const filas = await withoutTenant(app, (tx) =>
      tx.select().from(authEvents).where(sql`id = ${id}`),
    );
    expect(filas).toHaveLength(1);

    await owner.delete(authEvents).where(sql`id = ${id}`);
  });
});

describe('withTenant', () => {
  it('rechaza un gymId que no es UUID', async () => {
    await expect(withTenant(app, "'; DROP TABLE users; --", async () => null)).rejects.toThrow(
      /no es un UUID/,
    );
  });

  it('no filtra el contexto de una transaccion a la siguiente', async () => {
    // set_config con `true` hace la variable local a la transaccion. Si algun
    // dia alguien lo cambia a `false`, este test lo detecta: detras de un pooler
    // seria una fuga entre peticiones de gimnasios distintos.
    await withTenant(app, gymA, (tx) => tx.select().from(memberships));

    const rows = await withoutTenant(app, (tx) => tx.select().from(memberships));
    expect(rows).toHaveLength(0);
  });
});
