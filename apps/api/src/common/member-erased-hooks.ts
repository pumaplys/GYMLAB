import type { Transaction } from '@gymlab/db';

/**
 * Punto de extension para reaccionar al borrado de una ficha de socio (art. 17).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE HIZO FALTA, SI LAS CLAVES AJENAS YA BORRABAN EN CASCADA.         │
 * │                                                                          │
 * │ `personal-data.ts` daba por resuelto el borrado: "el articulo 17 ya lo   │
 * │ resuelven las claves ajenas". Y es cierto para todo lo que APUNTA a      │
 * │ `members` — notas, medidas, consentimientos, cuotas, asignaciones.       │
 * │                                                                          │
 * │ Pero `memberships` no apunta a `members`: apunta a `users` y a `gyms`.   │
 * │ Nada la cascadea. Al borrar la ficha de un socio con cuenta, esa persona │
 * │ seguia perteneciendo al gimnasio y lo seguia viendo en su selector, con  │
 * │ un 404 en todo lo que abriera. La cascada no llega donde no hay arista.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Y no puede resolverlo `MembersService` por su cuenta: `memberships` y `users`
 * son de `identity`, y ADR-0006 no permite que un modulo escriba en tablas
 * ajenas. Asi que `members` anuncia lo que ha pasado y quien sea dueno de esas
 * tablas decide que hacer — la misma forma que ya tenia `invitation-hooks`.
 */
export const MEMBER_ERASED_HOOK = Symbol('MEMBER_ERASED_HOOK');

export interface MemberErasedEvent {
  gymId: string;
  /** La ficha que se acaba de borrar. Ya no existe en la base de datos. */
  memberId: string;
  /**
   * Cuenta que tenia vinculada, o `null` si nunca llego a tener.
   *
   * El caso nulo es normal y frecuente, no un error: un gimnasio real tiene
   * socios que nunca tendran cuenta. Quien reacciona no tiene nada que hacer.
   */
  userId: string | null;
  /**
   * Transaccion del borrado.
   *
   * Se pasa explicitamente para que quien reaccione escriba DENTRO de ella. Es
   * lo que evita el estado a medias: si retirar la pertenencia fallara, la ficha
   * tampoco se borraria y la operacion entera se deshace.
   */
  tx: Transaction;
}

export interface MemberErasedHook {
  onMemberErased(evento: MemberErasedEvent): Promise<void>;
}

/**
 * REGLA PARA QUIEN IMPLEMENTE ESTA INTERFAZ, la misma que en los otros dos
 * puntos de extension y por el mismo motivo:
 *
 * el implementador NO puede depender de `MembersService`, ni directa ni
 * indirectamente. Este token esta en el grafo de dependencias de ese servicio,
 * asi que lo que se registre arrastra consigo todo lo que necesite, y cerrar el
 * circulo deja a Nest esperando para siempre en el arranque SIN ningun error.
 *
 * Por eso el implementador es una clase dedicada que lee y escribe sus propias
 * tablas con la transaccion del evento.
 */
export type MemberErasedHooks = readonly MemberErasedHook[];
