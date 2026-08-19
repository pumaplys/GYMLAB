import type { Transaction } from '@gymlab/db';
import type { Role } from '@gymlab/contracts';

/**
 * Punto de extensión para reaccionar a que alguien pierda el acceso al gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE HIZO FALTA: «RETIRAR ACCESO» DEJABA AL ENTRENADOR MEDIO VIVO.   │
 * │                                                                          │
 * │ `revokeAccess` termina la pertenencia y nada más — no puede hacer más,   │
 * │ porque `trainers` es tabla de otro módulo y ADR-0006 se lo prohíbe.      │
 * │                                                                          │
 * │ Medido en producción durante #77: al retirarle el acceso a un entrenador │
 * │ su `memberships.ended_at` quedaba puesto, pero su perfil seguía          │
 * │ `active` y sus asignaciones vigentes. El gimnasio veía un profesional    │
 * │ activo, con cartera de socios, que no podía entrar. No era corrupción de │
 * │ datos: era una pantalla que engañaba.                                    │
 * │                                                                          │
 * │ Así que `auth` ANUNCIA lo que ha pasado y quien es dueño de esas tablas  │
 * │ decide qué hacer — la misma forma que ya tenían `invitation-hooks` y     │
 * │ `member-erased-hooks`.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const ACCESS_REVOKED_HOOK = Symbol('ACCESS_REVOKED_HOOK');

export interface AccessRevokedEvent {
  gymId: string;
  /** La cuenta a la que se le ha retirado el acceso. */
  userId: string;
  /**
   * Con qué rol pertenecía.
   *
   * Viaja para que cada implementador decida si le toca: quien reacciona a los
   * entrenadores no tiene nada que hacer cuando se va alguien de recepción, y
   * preguntarlo por su cuenta le obligaría a leer `memberships`, que es de otro.
   */
  role: Role;
  /** Quién lo hizo. Para la auditoría de quien reaccione. */
  actorUserId: string;
  /**
   * Transacción de la revocación.
   *
   * Se pasa explícitamente para que quien reaccione escriba DENTRO de ella. Es
   * lo que evita el estado a medias: si cerrar el perfil del entrenador
   * fallara, la pertenencia tampoco se retiraría y la operación entera se
   * deshace.
   */
  tx: Transaction;
}

export interface AccessRevokedHook {
  onAccessRevoked(evento: AccessRevokedEvent): Promise<void>;
}

/** Una lista, como en los otros puntos de extensión: hoy reacciona uno. */
export type AccessRevokedHooks = AccessRevokedHook[];
