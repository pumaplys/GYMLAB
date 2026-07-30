import type { MembershipRole, Transaction } from '@gymlab/db';

/**
 * Punto de extension para reaccionar a una invitacion aceptada.
 *
 * POR QUE EXISTE ESTA INTERFAZ, y no una llamada directa.
 *
 * El flujo empuja en dos direcciones opuestas: `members` necesita crear
 * invitaciones, y al aceptarse hay que rellenar `members.user_id`. Las dos
 * juntas serian un ciclo entre modulos, que ADR-0006 no permite.
 *
 * Con esta interfaz, `invitations` depende de una abstraccion que vive en
 * `common` —donde no hay dependencias— y no sabe nada de `members`. La unica
 * direccion real es `members -> invitations`.
 *
 * Y hay una razon de futuro: el modulo de entrenadores tambien tendra que
 * reaccionar a una invitacion aceptada, para crear su perfil. Con llamadas
 * directas, `invitations` acabaria importando `members` y `staff`; con este
 * punto de extension, cada modulo se registra por su cuenta.
 */
export const INVITATION_ACCEPTED_HOOK = Symbol('INVITATION_ACCEPTED_HOOK');

export interface InvitationAcceptedEvent {
  gymId: string;
  invitationId: string;
  /** Socio al que apuntaba la invitacion, si venia de una ficha. */
  memberId: string | null;
  role: MembershipRole;
  /** Cuenta que acaba de aceptar, ya sea nueva o preexistente. */
  userId: string;
  /**
   * Transaccion de la aceptacion.
   *
   * Se pasa explicitamente para que quien reaccione escriba DENTRO de ella: si
   * el vinculo fallara, la invitacion tampoco se consume. La alternativa
   * —abrir otra transaccion— rompe esa atomicidad.
   */
  tx: Transaction;
}

export interface InvitationAcceptedHook {
  onInvitationAccepted(evento: InvitationAcceptedEvent): Promise<void>;
}
