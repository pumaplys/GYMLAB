import type {
  AccessEventList,
  GymStaffMember,
  Invitation,
  MemberTrainer,
  Role,
  Trainer,
} from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * Accesos, personal, invitaciones y entrenadores: las llamadas de verdad.
 *
 * Envoltorios y no `api.*` suelto en las pantallas: es lo que permite que la
 * vista previa web sustituya la fuente sin tocar una pantalla, y lo que
 * mantiene los datos de muestra fuera del binario nativo.
 */

// --- Accesos --------------------------------------------------------------

export function cargarAccesosReal(gymId: string, pageSize: number): Promise<AccessEventList> {
  return api.accesos.events(gymId, { pageSize });
}

// --- Personal -------------------------------------------------------------

export function cargarPersonalReal(gymId: string): Promise<GymStaffMember[]> {
  return api.staff.list(gymId);
}

export function retirarAccesoReal(gymId: string, userId: string): Promise<unknown> {
  return api.staff.revoke(gymId, userId);
}

// --- Invitaciones ---------------------------------------------------------

export function cargarInvitacionesReal(gymId: string): Promise<Invitation[]> {
  return api.invitations.list(gymId);
}

export function crearInvitacionReal(
  gymId: string,
  email: string,
  rol: Role,
): Promise<Invitation> {
  return api.invitations.create(gymId, { email, role: rol });
}

export function revocarInvitacionReal(gymId: string, id: string): Promise<unknown> {
  return api.invitations.revoke(gymId, id);
}

// --- Entrenadores de un socio ---------------------------------------------

export function cargarEntrenadoresReal(gymId: string): Promise<Trainer[]> {
  return api.entrenadores.lista(gymId);
}

export function cargarEntrenadoresDeSocioReal(
  gymId: string,
  socioId: string,
): Promise<MemberTrainer[]> {
  return api.entrenadores.deSocio(gymId, socioId);
}

export function asignarEntrenadorReal(
  gymId: string,
  entrenadorId: string,
  socioId: string,
): Promise<unknown> {
  return api.entrenadores.asignar(gymId, entrenadorId, socioId);
}

export function retirarEntrenadorReal(
  gymId: string,
  entrenadorId: string,
  socioId: string,
): Promise<unknown> {
  return api.entrenadores.retirar(gymId, entrenadorId, socioId);
}
