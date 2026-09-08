import type { GymStaffMember, Invitation, MemberTrainer, Role, Trainer } from '@gymlab/contracts';
import { CAN_INVITE } from '@gymlab/contracts';

/**
 * Personal, invitaciones y entrenadores del gimnasio, en pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ «PERSONAL» ES UN CONJUNTO DE ROLES, NO UN ROL.                          │
 * │                                                                          │
 * │ No existe ningun rol `staff` en el contrato: son `owner`, `receptionist` │
 * │ y `trainer`. La lista de personal es la de quien pertenece al gimnasio   │
 * │ SIN ser socio, y por eso se filtra por esos tres.                        │
 * │                                                                          │
 * │ A los socios NO se les invita desde aqui: se hace desde su ficha, que    │
 * │ ademas vincula la invitacion con ella. Mezclarlos llenaria la pantalla   │
 * │ de gente que no es personal — es la misma decision del panel web.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const ROLES_DE_PERSONAL: readonly Role[] = ['owner', 'receptionist', 'trainer'];

/**
 * Como se llama cada rol en pantalla.
 *
 * `Record<Role, string>` obliga a que un rol nuevo del contrato pase por aqui
 * en vez de aparecer en crudo en una lista que lee una persona.
 */
export const NOMBRE_DEL_ROL: Record<Role, string> = {
  owner: 'Dueño',
  receptionist: 'Recepción',
  trainer: 'Entrenador',
  member: 'Socio',
};

/** Solo el personal. Los socios se gestionan desde su ficha. */
export function soloPersonal<T extends { role: Role }>(gente: readonly T[]): T[] {
  return gente.filter((g) => ROLES_DE_PERSONAL.includes(g.role));
}

/**
 * A quien puede invitar quien.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES CONTROL DE ESCALADA DE PRIVILEGIOS, Y LA MATRIZ ES DEL CONTRATO.     │
 * │                                                                          │
 * │ `CAN_INVITE` vive en `@gymlab/contracts` justamente para que el cliente  │
 * │ pinte el desplegable con las MISMAS reglas que el servidor va a aplicar. │
 * │ Copiarla aqui seria la forma de que un dia recepcion pudiera crearse un  │
 * │ dueño y quedarse con el gimnasio.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se acota ademas a personal: invitar a un socio se hace desde su ficha.
 */
export function rolesQuePuedeInvitar(rol: Role): Role[] {
  return CAN_INVITE[rol].filter((r) => ROLES_DE_PERSONAL.includes(r));
}

/** El estado de una invitacion, que no es un campo: se deduce de tres fechas. */
export type EstadoDeInvitacion = 'aceptada' | 'revocada' | 'caducada' | 'pendiente';

export function estadoDeInvitacion(
  invitacion: Invitation,
  ahora: Date = new Date(),
): EstadoDeInvitacion {
  // El orden importa: una aceptada que ademas caduco sigue siendo aceptada.
  if (invitacion.acceptedAt !== null) return 'aceptada';
  if (invitacion.revokedAt !== null) return 'revocada';
  return new Date(invitacion.expiresAt) <= ahora ? 'caducada' : 'pendiente';
}

export const NOMBRE_DEL_ESTADO: Record<EstadoDeInvitacion, string> = {
  aceptada: 'Aceptada',
  revocada: 'Revocada',
  caducada: 'Caducada',
  pendiente: 'Pendiente',
};

/**
 * Revocar solo tiene sentido en una que sigue viva.
 *
 * El servidor rechaza revocar una ya aceptada o ya revocada, y una caducada ya
 * no sirve para nada. Ofrecerlo seria un boton que falla.
 */
export function sePuedeRevocar(invitacion: Invitation, ahora?: Date): boolean {
  return estadoDeInvitacion(invitacion, ahora) === 'pendiente';
}

/** La segunda linea de alguien del personal: que es y desde cuando. */
export function lineaDePersonal(
  persona: GymStaffMember,
  formatearFecha: (iso: string) => string,
): string {
  return `${NOMBRE_DEL_ROL[persona.role]} · desde el ${formatearFecha(persona.joinedAt)}`;
}

// --- Entrenadores de un socio --------------------------------------------

/**
 * Que entrenadores se pueden asignar a un socio.
 *
 * Dos motivos para dejar uno fuera, y los dos los impone el servidor: estar de
 * baja y estar ya asignado. Se filtran para no ofrecer lo que va a dar error.
 */
export function entrenadoresAsignables(
  entrenadores: readonly Trainer[],
  yaAsignados: readonly MemberTrainer[],
): Trainer[] {
  const suyos = new Set(yaAsignados.map((t) => t.trainerId));
  return entrenadores
    .filter((t) => t.status === 'active' && !suyos.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Como se lee un entrenador ya asignado a un socio. */
export function lineaDeEntrenadorDelSocio(
  asignado: MemberTrainer,
  formatearFecha: (iso: string) => string,
): { titulo: string; detalle: string } {
  const desde = `Desde el ${formatearFecha(asignado.assignedAt)}`;
  return {
    titulo: asignado.name,
    // Que este de baja NO se esconde: sigue asignado y hay que poder verlo
    // para decidir si se retira.
    detalle: asignado.status === 'active' ? desde : `${desde} · entrenador de baja`,
  };
}
