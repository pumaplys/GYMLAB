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
 * Y esa razon de futuro ya llego: `trainers` crea el perfil del entrenador
 * cuando acepta su invitacion, igual que `members` rellena su `user_id`. Con
 * llamadas directas, `invitations` importaria los dos modulos; con este punto de
 * extension, cada uno se registra por su cuenta y `invitations` no cambia.
 *
 * EL TOKEN RESUELVE UNA LISTA, no un solo implementador, justo por eso. Cuando
 * eran dos modulos en lugar de uno, un token de valor unico habria obligado a
 * elegir cual de los dos reacciona.
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

/**
 * REGLA PARA QUIEN IMPLEMENTE ESTA INTERFAZ, y cuesta caro descubrirla sola:
 *
 * el implementador NO puede depender de `InvitationsService`, ni directa ni
 * indirectamente. Este token esta en el grafo de dependencias de ese servicio,
 * asi que lo que se registre arrastra consigo todo lo que necesite. Cerrar el
 * circulo deja a Nest esperando para siempre en el arranque, SIN ningun error.
 *
 * Por eso los implementadores son clases dedicadas y sin dependencias
 * —`MemberAccountLink`, `TrainerProfileLink`— y no los servicios de cada modulo,
 * que si necesitan crear invitaciones. Ver ADR-0010.
 */
export type InvitationAcceptedHooks = readonly InvitationAcceptedHook[];
