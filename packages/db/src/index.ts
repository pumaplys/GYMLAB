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
