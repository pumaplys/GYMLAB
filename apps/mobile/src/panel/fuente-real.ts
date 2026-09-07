import type { DuesStatus, Member, MemberList } from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * Lo que el Panel movil le pide al servidor. Tres lecturas y ninguna escritura.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS TRES ENDPOINTS YA EXISTIAN, CON SU `@Roles` PUESTO.                 │
 * │                                                                          │
 * │   GET /gyms/:gymId/members?q=            owner, receptionist             │
 * │   GET /gyms/:gymId/members/:id           owner, receptionist             │
 * │   GET /gyms/:gymId/members/:id/dues      owner, receptionist             │
 * │                                                                          │
 * │ Exactamente los dos roles del area panel. No hace falta ni una linea de  │
 * │ backend, y el gate de la app no es la unica defensa: a un entrenador el  │
 * │ servidor le responderia 403 aunque llegara.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** El `q` busca por nombre, apellido, correo o numero de socio. Lo hace el servidor. */
export async function buscarSociosReal(gymId: string, consulta: string): Promise<MemberList> {
  return api.members.list(gymId, { q: consulta.trim(), page: 1, pageSize: 25 });
}

export async function cargarSocioReal(gymId: string, memberId: string): Promise<Member> {
  return api.members.getById(gymId, memberId);
}

export async function cargarCuotaReal(gymId: string, memberId: string): Promise<DuesStatus> {
  return api.billing.dues(gymId, memberId);
}
