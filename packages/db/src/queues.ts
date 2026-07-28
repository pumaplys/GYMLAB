/**
 * Colas de trabajos de pg-boss.
 *
 * Viven en este paquete, y no en `@gymlab/contracts`, por dos motivos:
 *
 * 1. De diseno. `contracts` son los tipos que comparten la API, el panel web y
 *    la app movil. El panel y la app nunca ven un nombre de cola: las colas no
 *    forman parte del contrato con los clientes. En cambio pg-boss guarda sus
 *    colas EN Postgres, y este paquete es el dueno de todo lo que toca la base
 *    de datos — incluida la instalacion de su esquema.
 *
 * 2. Practico, y es el que lo destapo. `scripts/install-pgboss.ts` se ejecuta
 *    dentro de `pnpm db:migrate`, que no pasa por Turborepo. Si importara de
 *    `@gymlab/contracts` necesitaria su `dist` ya construido, y en un checkout
 *    limpio no existe. Una migracion de base de datos no debe depender de haber
 *    compilado nada.
 *
 * Los nombres los comparten dos procesos: el script que crea las colas con el
 * rol propietario, y la API que las produce y consume. Si divergieran, los
 * trabajos se encolarian en una cola que nadie escucha.
 */
export const EMAIL_QUEUES = {
  resetPassword: 'email.reset-password',
  verifyEmail: 'email.verify-email',
  invitation: 'email.invitation',
} as const;

export type EmailQueue = (typeof EMAIL_QUEUES)[keyof typeof EMAIL_QUEUES];

/**
 * Colas de mantenimiento.
 *
 * `retention.auth-events` purga los eventos de autenticacion pasados 90 dias.
 * No es limpieza opcional: `auth_events` guarda IP y user-agent, y el RGPD
 * exige limitar el plazo de conservacion (art. 5.1.e).
 */
export const MAINTENANCE_QUEUES = {
  retentionAuthEvents: 'retention.auth-events',
} as const;

export const ALL_QUEUES: readonly string[] = [
  ...Object.values(EMAIL_QUEUES),
  ...Object.values(MAINTENANCE_QUEUES),
];

export interface EmailJob {
  to: string;
  /** Token de un solo uso. Nunca se registra en logs de produccion. */
  token: string;
  url: string;
}
