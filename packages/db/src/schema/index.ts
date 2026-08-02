/**
 * Esquema de base de datos de GYMLAB (Drizzle).
 *
 * REGLAS INNEGOCIABLES para toda tabla de negocio que se anada aqui:
 *
 *   1. Lleva columna `gym_id` (helper `tenantId()`) con FK a `gyms`.
 *   2. Se le anade su bloque en `sql/01-rls.sql` (ENABLE + politica).
 *   3. Se le anade un caso en `src/__tests__/tenant-isolation.test.ts`.
 *
 * Excepciones legitimas, y solo estas:
 *   - `organizations` y `gyms`: son la jerarquia del tenant, no cuelgan de el.
 *   - `users`: es el limite de autenticacion, anterior al contexto de tenant.
 *
 * Modulos pendientes (Fase 1): staff, billing, training, progress, access.
 */

export * from './_helpers';
export * from './organization';
export * from './identity';
export * from './members';
export * from './trainers';
export * from './invitations';
export * from './compliance';
export * from './audit';
