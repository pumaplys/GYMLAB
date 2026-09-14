/**
 * EL ESQUEMA QUE HACE POSIBLE EL ARTICULO 17 (migracion 0018).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PREGUNTA A POSTGRESQL, NO AL FICHERO DE ESQUEMA.                     │
 * │                                                                          │
 * │ Que `schema/invitations.ts` diga `onDelete: 'set null'` solo demuestra   │
 * │ lo que se PIDIO. Lo que decide si una persona puede ejercer su derecho   │
 * │ de supresion es lo que hay en la base: si la migracion no se aplicara, o │
 * │ alguien la revirtiera, el fichero seguiria diciendo lo mismo y el        │
 * │ borrado volveria a morir en un 500.                                      │
 * │                                                                          │
 * │ Por eso esto lee `information_schema` de la base de DESARROLLO.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Requiere:
 *   docker compose up -d
 *   pnpm db:migrate
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, createDatabase, type Database } from '../client';

let db: Database;

beforeAll(() => {
  db = createDatabase({ connectionString: process.env.DATABASE_URL!, max: 1 });
});

afterAll(async () => {
  if (db) await closeDatabase(db);
});

describe('migración 0018 · borrar una identidad deja de ser imposible', () => {
  it('`invitations.invited_by_user_id` admite NULL y borra con SET NULL', async () => {
    const r = await db.execute<{ is_nullable: string; delete_rule: string }>(sql`
      SELECT c.is_nullable, rc.delete_rule
      FROM information_schema.columns c
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = 'invitations_invited_by_user_id_users_id_fk'
      WHERE c.table_name = 'invitations' AND c.column_name = 'invited_by_user_id'`);

    const fila = r.rows[0];
    expect(fila, 'la clave ajena debería existir').toBeTruthy();

    /*
     * Las dos mitades hacen falta. Con `SET NULL` pero la columna todavia
     * `NOT NULL`, PostgreSQL acepta la definicion y luego revienta al borrar:
     * el fallo aparecería en produccion, no aqui.
     */
    expect(fila!.is_nullable, 'sin esto, SET NULL reventaría al ejecutarse').toBe('YES');
    expect(fila!.delete_rule, 'RESTRICT bloqueaba el derecho de supresión').toBe('SET NULL');
  });

  it('y ninguna invitación apunta a una cuenta que ya no existe', async () => {
    // La integridad que la propia clave ajena garantiza. Si esto fallara,
    // alguien habria tocado la tabla por fuera.
    const r = await db.execute<{ rotas: number }>(sql`
      SELECT count(*)::int AS rotas
      FROM invitations i
      LEFT JOIN users u ON u.id = i.invited_by_user_id
      WHERE i.invited_by_user_id IS NOT NULL AND u.id IS NULL`);

    expect(r.rows[0]!.rotas).toBe(0);
  });

  it('el correo del invitado sigue siendo obligatorio', async () => {
    /*
     * El borrado SUSTITUYE ese correo por una marca; no lo vacia. Si la
     * columna admitiera NULL, un hueco se leeria como «no habia correo», que
     * es falso, y ademas el servicio podria dejar de sustituirlo sin que nada
     * se quejara.
     */
    const r = await db.execute<{ is_nullable: string }>(sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'invitations' AND column_name = 'email'`);

    expect(r.rows[0]!.is_nullable).toBe('NO');
  });
});
