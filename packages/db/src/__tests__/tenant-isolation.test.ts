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
// Dentro del propio paquete se importa de `drizzle-orm` directamente; la
// re-exportacion desde `@gymlab/db` es para los consumidores.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, createDatabase, type Database } from '../client';
import {
  auditLog,
  authEvents,
  gyms,
  invitations,
  memberCounters,
  memberNotes,
  members,
  memberships,
  memberSubscriptions,
  organizations,
  payments,
  plans,
  trainerAssignments,
  trainers,
  users,
} from '../schema';
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
  // Cerrar los dos pools: sin esto las conexiones quedan abiertas hasta que
  // muere el proceso, y se acumulan con las de los demas ficheros de test.
  await closeDatabase(owner);
  await closeDatabase(app);
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

describe('tablas del modulo members', () => {
  /** Da de alta un socio con la conexion propietaria. */
  async function sembrarSocio(gymId: string, numero: number, apellido: string) {
    const id = randomUUID();
    await owner
      .insert(members)
      .values({ id, gymId, memberNumber: numero, firstName: 'Nombre', lastName: apellido });
    return id;
  }

  it('las fichas de socio estan aisladas por gimnasio', async () => {
    const enGymA = await sembrarSocio(gymA, 1, 'DelGimnasioA');
    const enGymB = await sembrarSocio(gymB, 1, 'DelGimnasioB');

    const vistos = await withTenant(app, gymA, (tx) => tx.select().from(members));

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.lastName).toBe('DelGimnasioA');

    await owner.delete(members).where(sql`id in (${enGymA}, ${enGymB})`);
  });

  it('el mismo numero de socio puede existir en dos gimnasios distintos', async () => {
    // El indice unico es (gym_id, member_number), no member_number a secas:
    // cada gimnasio empieza a contar por el 1.
    const a = await sembrarSocio(gymA, 7, 'Siete-A');
    const b = await sembrarSocio(gymB, 7, 'Siete-B');

    expect(a).not.toBe(b);

    await owner.delete(members).where(sql`id in (${a}, ${b})`);
  });

  it('un socio sin cuenta es valido: user_id es nullable', async () => {
    // Es la decision que ordena el modulo. La senora que va a aquagym y no
    // instala ninguna app tiene que poder existir.
    const id = await sembrarSocio(gymA, 2, 'SinCuenta');

    const filas = await withTenant(app, gymA, (tx) =>
      tx.select().from(members).where(eq(members.id, id)),
    );

    expect(filas[0]?.userId).toBeNull();

    await owner.delete(members).where(eq(members.id, id));
  });

  it('las notas del personal estan aisladas por gimnasio', async () => {
    const socioA = await sembrarSocio(gymA, 3, 'ConNota');
    const socioB = await sembrarSocio(gymB, 3, 'ConNotaB');
    await owner.insert(memberNotes).values([
      { gymId: gymA, memberId: socioA, authorUserId: userA, body: 'Nota del A' },
      { gymId: gymB, memberId: socioB, authorUserId: userB, body: 'Nota del B' },
    ]);

    const vistas = await withTenant(app, gymA, (tx) => tx.select().from(memberNotes));

    expect(vistas).toHaveLength(1);
    expect(vistas[0]?.body).toBe('Nota del A');

    await owner.delete(members).where(sql`id in (${socioA}, ${socioB})`);
  });

  it('el contador de numeros esta aislado por gimnasio', async () => {
    await owner.insert(memberCounters).values([
      { gymId: gymA, nextNumber: 50 },
      { gymId: gymB, nextNumber: 90 },
    ]);

    const vistos = await withTenant(app, gymA, (tx) => tx.select().from(memberCounters));

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.nextNumber).toBe(50);

    await owner.delete(memberCounters).where(sql`gym_id in (${gymA}, ${gymB})`);
  });

  it('un mismo email no puede repetirse entre socios ACTIVOS del mismo gimnasio', async () => {
    const primero = randomUUID();
    await owner.insert(members).values({
      id: primero,
      gymId: gymA,
      memberNumber: 10,
      firstName: 'Ana',
      lastName: 'Uno',
      email: 'repetido@test.local',
    });

    await expect(
      owner.insert(members).values({
        gymId: gymA,
        memberNumber: 11,
        firstName: 'Otra',
        lastName: 'Dos',
        email: 'repetido@test.local',
      }),
    ).rejects.toThrow();

    // Pero tras una baja, ese email vuelve a estar libre: el indice es parcial.
    await owner
      .update(members)
      .set({ status: 'inactive', leftAt: new Date() })
      .where(eq(members.id, primero));

    const segundo = randomUUID();
    await owner.insert(members).values({
      id: segundo,
      gymId: gymA,
      memberNumber: 12,
      firstName: 'Otra',
      lastName: 'Dos',
      email: 'repetido@test.local',
    });

    await owner.delete(members).where(sql`id in (${primero}, ${segundo})`);
  });
});

describe('tablas del modulo trainers', () => {
  /** Crea un perfil de entrenador con la conexion propietaria. */
  async function sembrarEntrenador(gymId: string, userId: string) {
    const id = randomUUID();
    await owner.insert(trainers).values({ id, gymId, userId });
    return id;
  }

  async function sembrarSocio(gymId: string, numero: number, apellido: string) {
    const id = randomUUID();
    await owner
      .insert(members)
      .values({ id, gymId, memberNumber: numero, firstName: 'Nombre', lastName: apellido });
    return id;
  }

  it('los perfiles de entrenador estan aislados por gimnasio', async () => {
    const enA = await sembrarEntrenador(gymA, userA);
    const enB = await sembrarEntrenador(gymB, userB);

    const vistos = await withTenant(app, gymA, (tx) => tx.select().from(trainers));

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.id).toBe(enA);

    await owner.delete(trainers).where(sql`id in (${enA}, ${enB})`);
  });

  it('la misma cuenta puede ser entrenadora en dos gimnasios', async () => {
    // El indice unico es (gym_id, user_id): una identidad global, un perfil por
    // gimnasio. Igual que una persona puede ser socia de dos gimnasios.
    const enA = await sembrarEntrenador(gymA, userA);
    const enB = await sembrarEntrenador(gymB, userA);

    expect(enA).not.toBe(enB);

    await owner.delete(trainers).where(sql`id in (${enA}, ${enB})`);
  });

  it('las asignaciones estan aisladas por gimnasio', async () => {
    const entrenadorA = await sembrarEntrenador(gymA, userA);
    const entrenadorB = await sembrarEntrenador(gymB, userB);
    const socioA = await sembrarSocio(gymA, 20, 'AsignadoA');
    const socioB = await sembrarSocio(gymB, 20, 'AsignadoB');
    await owner.insert(trainerAssignments).values([
      { gymId: gymA, trainerId: entrenadorA, memberId: socioA },
      { gymId: gymB, trainerId: entrenadorB, memberId: socioB },
    ]);

    const vistas = await withTenant(app, gymA, (tx) => tx.select().from(trainerAssignments));

    expect(vistas).toHaveLength(1);
    expect(vistas[0]?.memberId).toBe(socioA);

    await owner.delete(members).where(sql`id in (${socioA}, ${socioB})`);
    await owner.delete(trainers).where(sql`id in (${entrenadorA}, ${entrenadorB})`);
  });

  it('el mismo par entrenador-socio no puede estar asignado dos veces A LA VEZ', async () => {
    const entrenador = await sembrarEntrenador(gymA, userA);
    const socio = await sembrarSocio(gymA, 21, 'Duplicado');

    await owner
      .insert(trainerAssignments)
      .values({ gymId: gymA, trainerId: entrenador, memberId: socio });

    await expect(
      owner
        .insert(trainerAssignments)
        .values({ gymId: gymA, trainerId: entrenador, memberId: socio }),
    ).rejects.toThrow();

    // Pero el indice es PARCIAL: terminada la asignacion, volver a asignar a la
    // misma pareja mas adelante es legitimo y no choca con la fila historica.
    await owner
      .update(trainerAssignments)
      .set({ endedAt: new Date() })
      .where(eq(trainerAssignments.trainerId, entrenador));

    await owner
      .insert(trainerAssignments)
      .values({ gymId: gymA, trainerId: entrenador, memberId: socio });

    await owner.delete(members).where(eq(members.id, socio));
    await owner.delete(trainers).where(eq(trainers.id, entrenador));
  });

  it('RLS NO impide que un entrenador vea las asignaciones de un companero', async () => {
    // ESTE TEST DOCUMENTA UN LIMITE, no una garantia.
    //
    // Dentro de un gimnasio, RLS no distingue roles: el entrenador y el dueno
    // son el mismo `gymlab_app`. Que cada entrenador vea solo a SUS socios lo
    // decide TrainersService, y por eso tiene sus propios tests de abuso.
    // Si algun dia esto se pone en rojo porque las filas ajenas dejan de verse,
    // sera que alguien anadio una politica por rol — y habra que revisar si el
    // filtro de la aplicacion sigue haciendo falta.
    const entrenador1 = await sembrarEntrenador(gymA, userA);
    const entrenador2 = await sembrarEntrenador(gymA, userB);
    const socio = await sembrarSocio(gymA, 22, 'DeOtro');
    await owner
      .insert(trainerAssignments)
      .values({ gymId: gymA, trainerId: entrenador2, memberId: socio });

    const vistas = await withTenant(app, gymA, (tx) => tx.select().from(trainerAssignments));

    expect(vistas).toHaveLength(1);
    expect(vistas[0]?.trainerId).toBe(entrenador2);

    await owner.delete(members).where(eq(members.id, socio));
    await owner.delete(trainers).where(sql`id in (${entrenador1}, ${entrenador2})`);
  });
});

describe('tablas del modulo billing', () => {
  async function sembrarPlan(gymId: string) {
    const id = randomUUID();
    await owner
      .insert(plans)
      .values({ id, gymId, name: `Plan ${id.slice(0, 6)}`, priceCents: 3000, period: 'monthly' });
    return id;
  }

  async function sembrarSocio(gymId: string, numero: number) {
    const id = randomUUID();
    await owner
      .insert(members)
      .values({ id, gymId, memberNumber: numero, firstName: 'N', lastName: 'A' });
    return id;
  }

  it('los planes estan aislados por gimnasio', async () => {
    const enA = await sembrarPlan(gymA);
    const enB = await sembrarPlan(gymB);

    const vistos = await withTenant(app, gymA, (tx) => tx.select().from(plans));

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.id).toBe(enA);

    await owner.delete(plans).where(sql`id in (${enA}, ${enB})`);
  });

  it('las cuotas y los pagos estan aislados por gimnasio', async () => {
    const planA = await sembrarPlan(gymA);
    const planB = await sembrarPlan(gymB);
    const socioA = await sembrarSocio(gymA, 40);
    const socioB = await sembrarSocio(gymB, 40);

    await owner.insert(memberSubscriptions).values([
      {
        gymId: gymA,
        memberId: socioA,
        planId: planA,
        priceCents: 3000,
        startedOn: '2026-01-01',
        currentPeriodEnd: '2026-02-01',
      },
      {
        gymId: gymB,
        memberId: socioB,
        planId: planB,
        priceCents: 3000,
        startedOn: '2026-01-01',
        currentPeriodEnd: '2026-02-01',
      },
    ]);
    await owner.insert(payments).values([
      {
        gymId: gymA,
        memberId: socioA,
        concept: 'subscription',
        amountCents: 3000,
        method: 'cash',
        paidOn: '2026-01-01',
      },
      {
        gymId: gymB,
        memberId: socioB,
        concept: 'subscription',
        amountCents: 9999,
        method: 'cash',
        paidOn: '2026-01-01',
      },
    ]);

    const cuotas = await withTenant(app, gymA, (tx) => tx.select().from(memberSubscriptions));
    expect(cuotas).toHaveLength(1);
    expect(cuotas[0]?.memberId).toBe(socioA);

    const pagados = await withTenant(app, gymA, (tx) => tx.select().from(payments));
    expect(pagados).toHaveLength(1);
    expect(pagados[0]?.amountCents).toBe(3000);

    await owner.delete(members).where(sql`id in (${socioA}, ${socioB})`);
    await owner.delete(payments).where(sql`gym_id in (${gymA}, ${gymB})`);
    await owner.delete(memberSubscriptions).where(sql`gym_id in (${gymA}, ${gymB})`);
    await owner.delete(plans).where(sql`id in (${planA}, ${planB})`);
  });

  it('la aplicacion NO puede borrar un pago: append-only impuesto por permisos', async () => {
    // El caracter append-only no se deja al codigo. Anular es un UPDATE previsto
    // (`voided_at`); hacer desaparecer la fila no existe como operacion.
    const plan = await sembrarPlan(gymA);
    const socio = await sembrarSocio(gymA, 41);
    const pago = randomUUID();
    await owner.insert(memberSubscriptions).values({
      gymId: gymA,
      memberId: socio,
      planId: plan,
      priceCents: 3000,
      startedOn: '2026-01-01',
      currentPeriodEnd: '2026-02-01',
    });
    await owner.insert(payments).values({
      id: pago,
      gymId: gymA,
      memberId: socio,
      concept: 'subscription',
      amountCents: 3000,
      method: 'cash',
      paidOn: '2026-01-01',
    });

    await expect(
      withTenant(app, gymA, (tx) => tx.delete(payments).where(eq(payments.id, pago))),
    ).rejects.toThrow();

    // Pero anularlo si se puede: es la via prevista para corregir un error.
    await withTenant(app, gymA, (tx) =>
      tx.update(payments).set({ voidedAt: new Date() }).where(eq(payments.id, pago)),
    );

    await owner.delete(members).where(eq(members.id, socio));
    await owner.delete(payments).where(eq(payments.id, pago));
    await owner.delete(memberSubscriptions).where(sql`gym_id = ${gymA}`);
    await owner.delete(plans).where(eq(plans.id, plan));
  });

  it('un socio no puede tener DOS cuotas vigentes a la vez', async () => {
    const plan = await sembrarPlan(gymA);
    const socio = await sembrarSocio(gymA, 42);
    const primera = {
      gymId: gymA,
      memberId: socio,
      planId: plan,
      priceCents: 3000,
      startedOn: '2026-01-01',
      currentPeriodEnd: '2026-02-01',
    };

    await owner.insert(memberSubscriptions).values(primera);
    await expect(owner.insert(memberSubscriptions).values(primera)).rejects.toThrow();

    // Cancelada la primera, se puede dar de alta otra: el indice es parcial, y
    // ese es el camino de vuelta de quien dejo de pagar y quiere volver.
    await owner
      .update(memberSubscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(memberSubscriptions.memberId, socio));
    await owner.insert(memberSubscriptions).values(primera);

    await owner.delete(members).where(eq(members.id, socio));
    await owner.delete(memberSubscriptions).where(sql`gym_id = ${gymA}`);
    await owner.delete(plans).where(eq(plans.id, plan));
  });
});

describe('integridad referencial: el tenant viaja en la clave ajena', () => {
  /**
   * Estos tests cubren un hueco REAL que existio y se verifico ejecutando: con
   * la clave ajena simple, una fila del gimnasio A podia apuntar a un socio del
   * B. No habia fuga, porque al leer el JOIN con `members` esta filtrado por
   * RLS y la fila desaparecia — pero lo que nos salvaba era la politica de OTRA
   * tabla. Ahora la incoherencia es irrepresentable.
   */
  async function sembrarSocio(gymId: string, numero: number) {
    const id = randomUUID();
    await owner
      .insert(members)
      .values({ id, gymId, memberNumber: numero, firstName: 'N', lastName: 'A' });
    return id;
  }

  it('una asignacion no puede apuntar a un socio de OTRO gimnasio', async () => {
    const entrenadorA = randomUUID();
    await owner.insert(trainers).values({ id: entrenadorA, gymId: gymA, userId: userA });
    const socioB = await sembrarSocio(gymB, 60);

    await expect(
      owner
        .insert(trainerAssignments)
        .values({ gymId: gymA, trainerId: entrenadorA, memberId: socioB }),
    ).rejects.toThrow();

    await owner.delete(members).where(eq(members.id, socioB));
    await owner.delete(trainers).where(eq(trainers.id, entrenadorA));
  });

  it('una cuota no puede apuntar a un plan de OTRO gimnasio', async () => {
    const planB = randomUUID();
    await owner
      .insert(plans)
      .values({ id: planB, gymId: gymB, name: 'De B', priceCents: 3000, period: 'monthly' });
    const socioA = await sembrarSocio(gymA, 61);

    await expect(
      owner.insert(memberSubscriptions).values({
        gymId: gymA,
        memberId: socioA,
        planId: planB,
        priceCents: 3000,
        startedOn: '2026-01-01',
        currentPeriodEnd: '2026-01-01',
      }),
    ).rejects.toThrow();

    await owner.delete(members).where(eq(members.id, socioA));
    await owner.delete(plans).where(eq(plans.id, planB));
  });

  it('borrar al socio deja el pago desligado SIN romper su gym_id', async () => {
    // EL TEST QUE JUSTIFICA LA SINTAXIS RARA DE LA MIGRACION.
    //
    // La clave es compuesta, asi que un `ON DELETE SET NULL` normal pondria a
    // NULL las DOS columnas, incluida `gym_id`, que es NOT NULL: borrar un socio
    // fallaria. Por eso lleva la lista de columnas de PostgreSQL 15+, que drizzle
    // no sabe generar y va escrita a mano en la migracion 0008.
    //
    // El comportamiento buscado es el del art. 17.3.b: el pago sobrevive con
    // importe y fecha para la contabilidad del gimnasio, sin dato personal.
    const socio = await sembrarSocio(gymA, 62);
    const pago = randomUUID();
    await owner.insert(payments).values({
      id: pago,
      gymId: gymA,
      memberId: socio,
      concept: 'subscription',
      amountCents: 3000,
      method: 'cash',
      paidOn: '2026-01-01',
    });

    await owner.delete(members).where(eq(members.id, socio));

    const filas = await owner.select().from(payments).where(eq(payments.id, pago));
    expect(filas).toHaveLength(1);
    expect(filas[0]?.memberId).toBeNull();
    expect(filas[0]?.gymId).toBe(gymA);
    expect(filas[0]?.amountCents).toBe(3000);

    await owner.delete(payments).where(eq(payments.id, pago));
  });

  it('TODA clave ajena hacia una tabla de tenant lleva gym_id', async () => {
    // Guardarrail, hermano del que exige RLS a toda tabla con gym_id: si alguien
    // anade una relacion nueva apuntando solo por `id`, esto se pone en rojo en
    // el PR en lugar de descubrirse con datos cruzados en produccion.
    const conTenant = ['members', 'trainers', 'plans', 'member_subscriptions'];

    const result = await owner.execute<{ tabla: string; constraint: string; def: string }>(sql`
      SELECT conrelid::regclass::text AS tabla,
             conname AS constraint,
             pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid::regclass::text = ANY(${sql.raw(
          `ARRAY[${conTenant.map((t) => `'${t}'`).join(',')}]`,
        )})
    `);

    expect(result.rows.length).toBeGreaterThan(0);
    for (const fila of result.rows) {
      expect(fila.def, `${fila.tabla}.${fila.constraint} no incluye gym_id`).toContain('gym_id');
    }
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
