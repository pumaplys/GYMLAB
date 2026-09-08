import type {
  AccessEvent,
  AccessEventList,
  GymStaffMember,
  Invitation,
  MemberTrainer,
  Role,
  Trainer,
} from '@gymlab/contracts';
import {
  asignarEntrenadorReal,
  cargarAccesosReal,
  cargarEntrenadoresDeSocioReal,
  cargarEntrenadoresReal,
  cargarInvitacionesReal,
  cargarPersonalReal,
  crearInvitacionReal,
  retirarAccesoReal,
  retirarEntrenadorReal,
  revocarInvitacionReal,
} from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DE ACCESOS, PERSONAL, INVITACIONES Y ENTRENADORES.         │
 * │ SOLO WEB, SOLO CON LA VARIABLE, SOLO CON `?vista=`.                      │
 * │                                                                          │
 * │ Aqui hay tres acciones que quitan acceso a personas: retirar a alguien   │
 * │ del personal, revocar una invitacion y retirar un entrenador. NINGUNA    │
 * │ ocurre en la vista previa: se devuelve lo que devolveria el servidor y   │
 * │ NO SE TOCA NADA.                                                         │
 * │                                                                          │
 * │ Los nombres y los correos son inventados: `@ejemplo.local` no es un      │
 * │ dominio que exista.                                                      │
 * │                                                                          │
 * │ `.web.ts`: en iOS y Android Metro coge `fuente.ts`. Lo comprueba el gate │
 * │ de aislamiento.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

function casoActual(): string | null {
  if (!HABILITADA) return null;
  return new URLSearchParams(window.location.search).get('vista');
}

/** Los casos de esta vista previa empiezan todos por `equipo-`. */
const esMio = (caso: string | null) => caso?.startsWith('equipo-') === true;

function evento(parcial: Partial<AccessEvent>): AccessEvent {
  return {
    id: 'v1111111-1111-4111-8111-111111111111',
    memberId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    memberName: 'Socia de Muestra',
    decision: 'ALLOW',
    reason: 'OK',
    isRetry: false,
    occurredAt: '2026-09-08T08:12:00.000Z',
    ...parcial,
  };
}

const EVENTOS: AccessEvent[] = [
  evento({}),
  evento({
    id: 'v2222222-2222-4222-8222-222222222222',
    memberName: 'Socio del Puerto',
    decision: 'WARN',
    reason: 'DUES_WARN',
    occurredAt: '2026-09-08T08:05:00.000Z',
  }),
  evento({
    id: 'v3333333-3333-4333-8333-333333333333',
    memberName: 'Socia de Muestra',
    decision: 'ALLOW',
    reason: 'OK',
    isRetry: true,
    occurredAt: '2026-09-08T08:12:03.000Z',
  }),
  evento({
    id: 'v4444444-4444-4444-8444-444444444444',
    memberId: null,
    memberName: null,
    decision: 'DENY',
    reason: 'BAD_SIGNATURE',
    occurredAt: '2026-09-07T19:40:00.000Z',
  }),
];

const PERSONAL: GymStaffMember[] = [
  {
    userId: 'u1111111-1111-4111-8111-111111111111',
    name: 'Dueña de Muestra',
    email: 'duena.muestra@ejemplo.local',
    role: 'owner',
    joinedAt: '2025-11-02',
  } as GymStaffMember,
  {
    userId: 'u2222222-2222-4222-8222-222222222222',
    name: 'Recepción de Muestra',
    email: 'recepcion.muestra@ejemplo.local',
    role: 'receptionist',
    joinedAt: '2026-02-15',
  } as GymStaffMember,
  {
    userId: 'u3333333-3333-4333-8333-333333333333',
    name: 'Entrenadora de Muestra',
    email: 'entrenadora.muestra@ejemplo.local',
    role: 'trainer',
    joinedAt: '2026-03-04',
  } as GymStaffMember,
];

function invitacion(parcial: Partial<Invitation>): Invitation {
  return {
    id: 'n1111111-1111-4111-8111-111111111111',
    email: 'nueva.entrenadora@ejemplo.local',
    role: 'trainer',
    // Lejos a proposito: asi el caso «pendiente» no caduca con el tiempo.
    expiresAt: '2099-01-01T00:00:00.000Z',
    acceptedAt: null,
    revokedAt: null,
    ...parcial,
  };
}

const INVITACIONES: Invitation[] = [
  invitacion({}),
  invitacion({
    id: 'n2222222-2222-4222-8222-222222222222',
    email: 'caducada@ejemplo.local',
    role: 'receptionist',
    expiresAt: '2026-01-01T00:00:00.000Z',
  }),
  invitacion({
    id: 'n3333333-3333-4333-8333-333333333333',
    email: 'aceptada@ejemplo.local',
    acceptedAt: '2026-04-01T10:00:00.000Z',
  }),
  // Un socio: NO debe salir en la pantalla de personal.
  invitacion({
    id: 'n4444444-4444-4444-8444-444444444444',
    email: 'socio.invitado@ejemplo.local',
    role: 'member',
  }),
];

const ENTRENADORES: Trainer[] = [
  {
    id: 't1111111-1111-4111-8111-111111111111',
    name: 'Entrenadora de Muestra',
    email: 'entrenadora.muestra@ejemplo.local',
    bio: null,
    phone: null,
    status: 'active',
    activeMembers: 4,
    createdAt: '2026-03-04',
  } as Trainer,
  {
    id: 't2222222-2222-4222-8222-222222222222',
    name: 'Otro Entrenador',
    email: 'otro.entrenador@ejemplo.local',
    bio: null,
    phone: null,
    status: 'active',
    activeMembers: 0,
    createdAt: '2026-06-01',
  } as Trainer,
  {
    id: 't3333333-3333-4333-8333-333333333333',
    name: 'Entrenador de Baja',
    email: 'de.baja@ejemplo.local',
    bio: null,
    phone: null,
    status: 'inactive',
    activeMembers: 0,
    createdAt: '2025-09-01',
  } as Trainer,
];

const DEL_SOCIO: MemberTrainer[] = [
  {
    assignmentId: 'x1111111-1111-4111-8111-111111111111',
    trainerId: 't1111111-1111-4111-8111-111111111111',
    name: 'Entrenadora de Muestra',
    status: 'active',
    assignedAt: '2026-05-04',
  },
];

// --- Accesos --------------------------------------------------------------

export async function cargarAccesos(gymId: string, pageSize: number): Promise<AccessEventList> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarAccesosReal(gymId, pageSize);
  if (caso === 'equipo-accesos-cargando') return new Promise<AccessEventList>(() => undefined);
  if (caso === 'equipo-accesos-error') throw new Error('historial de muestra: fallo simulado');
  const items = caso === 'equipo-accesos-vacio' ? [] : EVENTOS;
  return { items, total: items.length, page: 1, pageSize };
}

// --- Personal -------------------------------------------------------------

export async function cargarPersonal(gymId: string): Promise<GymStaffMember[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarPersonalReal(gymId);
  if (caso === 'equipo-error') throw new Error('personal de muestra: fallo simulado');
  return PERSONAL;
}

export async function retirarAcceso(gymId: string, userId: string): Promise<unknown> {
  const caso = casoActual();
  if (!esMio(caso)) return retirarAccesoReal(gymId, userId);
  // NO se retira nada: es una vista previa.
  return { ok: true };
}

// --- Invitaciones ---------------------------------------------------------

export async function cargarInvitaciones(gymId: string): Promise<Invitation[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarInvitacionesReal(gymId);
  if (caso === 'equipo-error') throw new Error('invitaciones de muestra: fallo simulado');
  return caso === 'equipo-sin-invitaciones' ? [] : INVITACIONES;
}

export async function crearInvitacion(
  gymId: string,
  email: string,
  rol: Role,
): Promise<Invitation> {
  const caso = casoActual();
  if (!esMio(caso)) return crearInvitacionReal(gymId, email, rol);
  if (caso === 'equipo-invitar-existente') {
    throw new Error('Ese correo ya pertenece a este gimnasio.');
  }
  return invitacion({ id: 'n9', email, role: rol });
}

export async function revocarInvitacion(gymId: string, id: string): Promise<unknown> {
  const caso = casoActual();
  if (!esMio(caso)) return revocarInvitacionReal(gymId, id);
  return { ok: true };
}

// --- Entrenadores ---------------------------------------------------------

export async function cargarEntrenadores(gymId: string): Promise<Trainer[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarEntrenadoresReal(gymId);
  return ENTRENADORES;
}

export async function cargarEntrenadoresDeSocio(
  gymId: string,
  socioId: string,
): Promise<MemberTrainer[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarEntrenadoresDeSocioReal(gymId, socioId);
  return caso === 'equipo-socio-sin-entrenador' ? [] : DEL_SOCIO;
}

export async function asignarEntrenador(
  gymId: string,
  entrenadorId: string,
  socioId: string,
): Promise<unknown> {
  const caso = casoActual();
  if (!esMio(caso)) return asignarEntrenadorReal(gymId, entrenadorId, socioId);
  return { ok: true };
}

export async function retirarEntrenador(
  gymId: string,
  entrenadorId: string,
  socioId: string,
): Promise<unknown> {
  const caso = casoActual();
  if (!esMio(caso)) return retirarEntrenadorReal(gymId, entrenadorId, socioId);
  return { ok: true };
}
