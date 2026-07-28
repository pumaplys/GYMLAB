/**
 * @gymlab/db
 *
 * Acceso a datos de GYMLAB. Lo consume unicamente `@gymlab/api`: ni el panel
 * web ni la app movil deben importar este paquete jamas.
 *
 * Las tres piezas que sostienen el aislamiento multi-tenant:
 *   - `withTenant()`     fija `app.gym_id` en una transaccion
 *   - las politicas RLS  en `sql/01-rls.sql`
 *   - `assertRlsIsEnforced()` evita que la app se conecte con un rol que las ignora
 */

export * from './schema';
export * from './client';
export * from './tenant';
export * from './queues';

/**
 * Operadores de consulta, re-exportados a proposito.
 *
 * Los consumidores importan `eq`, `and`, `sql`... desde aqui y NUNCA desde
 * `drizzle-orm` directamente. Dos motivos:
 *
 * 1. Tecnico. En un monorepo con pnpm, dos paquetes que dependen de drizzle-orm
 *    con distinto conjunto de peers acaban con dos instancias fisicas. Misma
 *    version, tipos nominalmente incompatibles, y un error de compilacion
 *    incomprensible. Re-exportando desde aqui, la instancia es una por
 *    construccion.
 *
 * 2. De diseno, que es el importante. El ORM es un detalle de infraestructura
 *    de este paquete. Que `apps/api` importara `drizzle-orm` seria filtrarlo a
 *    la capa de aplicacion; el dia que cambie el ORM, el cambio quedaria
 *    contenido aqui.
 */
export {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
