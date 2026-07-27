import { AsyncLocalStorage } from 'node:async_hooks';
import type { MembershipRole, Transaction } from '@gymlab/db';

/**
 * Contexto de la peticion en curso.
 *
 * Vive en AsyncLocalStorage y no en el objeto `request` de Express por un motivo
 * concreto: asi los repositorios pueden leer la transaccion sin que haya que
 * pasarla como argumento por cada capa hasta el fondo.
 *
 * Se rellena en dos pasos:
 *   1. `RequestContextMiddleware` crea el almacen vacio, antes que nada.
 *   2. `AuthGuard` lo rellena con la identidad ya verificada.
 *   3. `TenantInterceptor` anade la transaccion (ADR-0008).
 *
 * El middleware es imprescindible: un guard no puede envolver la ejecucion
 * posterior, asi que no puede abrir el almacen el mismo.
 */
export interface RequestContext {
  userId: string;
  sessionId: string;
  /**
   * Gimnasio activo. **Siempre del servidor, nunca de la peticion** (ADR-0007).
   *
   * Nulo mientras el usuario no ha elegido gimnasio, o si es superadmin de
   * plataforma, que no opera dentro de ningun tenant.
   */
  gymId: string | null;
  /** Rol en el gimnasio activo. Nulo si no hay gimnasio activo. */
  role: MembershipRole | null;
  isPlatformAdmin: boolean;
  /**
   * Transaccion de la peticion. La abre `TenantInterceptor` con `withTenant()`,
   * de modo que ya lleva `app.gym_id` fijado.
   */
  tx?: Transaction;
}

const storage = new AsyncLocalStorage<Partial<RequestContext>>();

/** Abre el almacen para toda la cadena posterior. Lo llama el middleware. */
export function runWithRequestContext<T>(fn: () => T): T {
  return storage.run({}, fn);
}

/** Devuelve el contexto, o `undefined` fuera de una peticion (jobs, tests). */
export function getRequestContext(): Partial<RequestContext> | undefined {
  return storage.getStore();
}

/**
 * Devuelve el contexto de un usuario ya autenticado.
 * Lanza si se llama desde un punto sin autenticacion: es un fallo de
 * programacion, no una situacion esperada.
 */
export function requireRequestContext(): RequestContext {
  const store = storage.getStore();
  if (!store?.userId || !store.sessionId) {
    throw new Error(
      '[api] Se ha pedido el contexto de peticion fuera de una ruta autenticada. ' +
        'Falta AuthGuard, o el codigo se ejecuta fuera del ciclo HTTP.',
    );
  }
  return store as RequestContext;
}

/**
 * Devuelve la transaccion de la peticion.
 *
 * Que esto lance significa que se esta intentando tocar la base de datos fuera
 * del contexto de tenant — exactamente lo que RLS convertiria en cero filas de
 * forma silenciosa. Mejor un error ruidoso aqui.
 */
export function requireTransaction(): Transaction {
  const store = storage.getStore();
  if (!store?.tx) {
    throw new Error(
      '[api] No hay transaccion en el contexto. La ruta necesita TenantInterceptor ' +
        'y un gimnasio activo en la sesion.',
    );
  }
  return store.tx;
}

/** Uso interno de los guards y del interceptor. */
export function patchRequestContext(patch: Partial<RequestContext>): void {
  const store = storage.getStore();
  if (!store) {
    throw new Error('[api] RequestContextMiddleware no se ha ejecutado.');
  }
  Object.assign(store, patch);
}
