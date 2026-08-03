import type { Transaction } from '@gymlab/db';

/**
 * Punto de extension para reaccionar al alta de un gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE EXISTE, y no una llamada directa como habia antes.                │
 * │                                                                          │
 * │ Crear un gimnasio implica sembrar su biblioteca de ejercicios (ADR-0012), │
 * │ y eso lo sabe hacer `training`. La version anterior inyectaba             │
 * │ `TrainingService` en `AuthService`, con dos consecuencias malas:          │
 * │                                                                          │
 * │  1. `auth`, que es `@Global` y la base de todo, pasaba a depender de un   │
 * │     modulo de DOMINIO. Era la unica flecha del grafo que iba de la        │
 * │     infraestructura hacia dentro.                                         │
 * │  2. Dejaba un ciclo LATENTE: `auth -> training -> members -> invitations` │
 * │     y de ahi al token de `auth`. Hoy nadie inyecta `AuthService`, asi que │
 * │     no se cerraba; el dia que alguien lo hiciera, Nest se colgaria en el  │
 * │     arranque SIN ningun error — el fallo de ADR-0010 otra vez.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Con esto, `auth` solo conoce una interfaz de `common`, que no depende de nada.
 */
export const GYM_CREATED_HOOK = Symbol('GYM_CREATED_HOOK');

export interface GymCreatedEvent {
  gymId: string;
  /** Cuenta del dueno que acaba de crearlo. */
  ownerUserId: string;
  /**
   * Transaccion del alta.
   *
   * Se pasa explicitamente —como en el hook de invitaciones— porque el alta
   * ocurre fuera del ciclo normal de peticion autenticada y no hay contexto que
   * consultar. Y obliga a que lo que se siembre viva dentro de la MISMA
   * transaccion: o hay gimnasio con biblioteca, o no hay gimnasio.
   */
  tx: Transaction;
}

export interface GymCreatedHook {
  onGymCreated(evento: GymCreatedEvent): Promise<void>;
}

/**
 * MISMA REGLA QUE EN LOS OTROS DOS PUNTOS DE EXTENSION:
 *
 * el implementador no puede depender de `AuthService` ni, indirectamente, de
 * nada que dependa de el. Este token esta en el grafo de `AuthService`, asi que
 * lo que se registre arrastra consigo todo lo que necesite.
 */
export type GymCreatedHooks = readonly GymCreatedHook[];
