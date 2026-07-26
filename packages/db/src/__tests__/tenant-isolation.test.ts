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
import { gyms, memberships, organizations, users } from '../schema';
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

  it('RLS esta habilitado en las tablas de tenant', async () => {
    const result = await app.execute<{ relname: string; relrowsecurity: boolean }>(sql`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relname IN ('gyms', 'organizations', 'memberships')
    `);

    for (const row of result.rows) {
      expect(row.relrowsecurity, `RLS desactivado en ${row.relname}`).toBe(true);
    }
    expect(result.rows).toHaveLength(3);
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
