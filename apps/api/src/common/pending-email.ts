import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Captura temporal de los correos que habria que enviar.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ ESTO ES UN ANDAMIO, Y TIENE FECHA DE DEMOLICION.                     │
 * │                                                                      │
 * │ ADR-0008 prohibe el I/O externo sincrono dentro de un handler, y     │
 * │ pg-boss todavia no existe. Mientras tanto, los callbacks de Better   │
 * │ Auth que "envian" el correo dejan aqui el token, el handler lo       │
 * │ recoge y en desarrollo lo devuelve en la respuesta para poder probar │
 * │ el flujo completo.                                                   │
 * │                                                                      │
 * │ CUANDO ENTRE PG-BOSS: los callbacks pasan a encolar el trabajo       │
 * │ dentro de la transaccion de la peticion (transactional outbox), este │
 * │ archivo desaparece y `devToken` deja de existir.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Funciona porque los callbacks de Better Auth se ejecutan de forma sincrona
 * dentro de la llamada del handler, asi que comparten contexto asincrono.
 */
export interface PendingEmail {
  kind: 'reset-password' | 'verify-email';
  token: string;
  url: string;
  userId: string;
}

const storage = new AsyncLocalStorage<{ email?: PendingEmail }>();

/** Envuelve una operacion que puede generar un correo. */
export function captureEmails<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({}, fn);
}

/** Lo llaman los callbacks de Better Auth en lugar de enviar nada. */
export function recordPendingEmail(email: PendingEmail): void {
  const store = storage.getStore();
  if (store) store.email = email;
}

/** Lo llama el handler para recuperar lo que se habria enviado. */
export function takePendingEmail(): PendingEmail | undefined {
  return storage.getStore()?.email;
}
