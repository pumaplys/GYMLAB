/**
 * Colas de trabajos.
 *
 * Los nombres viven aqui porque los comparten dos procesos distintos: el script
 * que crea las colas con el rol propietario y la API que las produce y consume.
 * Si divergieran, los trabajos se encolarian en una cola que nadie escucha.
 */
export const EMAIL_QUEUES = {
  resetPassword: 'email.reset-password',
  verifyEmail: 'email.verify-email',
  invitation: 'email.invitation',
} as const;

export type EmailQueue = (typeof EMAIL_QUEUES)[keyof typeof EMAIL_QUEUES];

export const ALL_QUEUES: readonly string[] = Object.values(EMAIL_QUEUES);

export interface EmailJob {
  to: string;
  /** Token de un solo uso. Nunca se registra en logs de produccion. */
  token: string;
  url: string;
}
