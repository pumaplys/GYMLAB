import type {
  CreateMemberInput,
  CreatePlanInput,
  CreateSubscriptionInput,
  DuesStatus,
  Invitation,
  Member,
  Payment,
  Plan,
  RegisterPaymentInput,
  Subscription,
  UpdateMemberInput,
  UpdatePlanInput,
} from '@gymlab/contracts';
import {
  actualizarPlanReal,
  actualizarSocioReal,
  anularPagoReal,
  archivarPlanReal,
  cargarCuotaDeSocioReal,
  cargarPagosReal,
  cargarPlanesReal,
  congelarCuotaReal,
  crearPlanReal,
  crearSocioReal,
  darDeAltaCuotaReal,
  darDeBajaCuotaReal,
  darDeBajaSocioReal,
  eliminarSocioReal,
  exportarDatosReal,
  invitarSocioReal,
  reactivarSocioReal,
  registrarPagoReal,
  reanudarCuotaReal,
} from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DEL MOSTRADOR. SOLO WEB, SOLO CON LA VARIABLE, SOLO         │
 * │ CON `?vista=`.                                                           │
 * │                                                                          │
 * │ Aqui viven las pantallas que MAS pueden estropear: dar de baja a alguien,│
 * │ borrarlo para siempre, cobrar y anular un cobro. Ninguna de esas cosas    │
 * │ ocurre en la vista previa: se devuelve lo que devolveria el servidor y    │
 * │ NO SE TOCA NADA.                                                         │
 * │                                                                          │
 * │ Los importes y los nombres son inventados. No salen de la ficha de nadie: │
 * │ un historial economico de verdad no se copia ni para una captura.         │
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

/** Los casos de esta vista previa empiezan todos por `mostrador-`. */
const esMio = (caso: string | null) => caso?.startsWith('mostrador-') === true;

const SOCIO: Member = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  memberNumber: 128,
  firstName: 'Socia',
  lastName: 'de Muestra',
  email: 'socia.muestra@ejemplo.local',
  phone: '600 000 000',
  birthDate: '1992-04-18',
  status: 'active',
  joinedAt: '2026-01-10',
  leftAt: null,
  hasAccount: false,
};

function plan(parcial: Partial<Plan>): Plan {
  return {
    id: 'p1111111-1111-4111-8111-111111111111',
    name: 'Mensual',
    description: 'Acceso libre en horario de sala.',
    priceCents: 3500,
    currency: 'EUR',
    period: 'monthly',
    status: 'active',
    activeSubscriptions: 12,
    ...parcial,
  };
}

const PLANES: Plan[] = [
  plan({}),
  plan({
    id: 'p2222222-2222-4222-8222-222222222222',
    name: 'Trimestral',
    period: 'quarterly',
    priceCents: 9500,
    activeSubscriptions: 3,
  }),
  plan({
    id: 'p3333333-3333-4333-8333-333333333333',
    name: 'Antiguo mensual',
    priceCents: 2900,
    status: 'archived',
    activeSubscriptions: 0,
  }),
];

function pago(parcial: Partial<Payment>): Payment {
  return {
    id: 'a1111111-1111-4111-8111-111111111111',
    concept: 'subscription',
    amountCents: 3500,
    currency: 'EUR',
    method: 'cash',
    paidOn: '2026-08-20',
    note: null,
    voidedAt: null,
    voidReason: null,
    ...parcial,
  } as Payment;
}

const PAGOS: Payment[] = [
  pago({}),
  pago({
    id: 'a2222222-2222-4222-8222-222222222222',
    concept: 'enrolment',
    method: 'card',
    amountCents: 2000,
    paidOn: '2026-01-10',
  }),
  pago({
    id: 'a3333333-3333-4333-8333-333333333333',
    method: 'transfer',
    amountCents: 3500,
    paidOn: '2026-07-20',
    voidedAt: '2026-07-21T10:00:00.000Z',
    voidReason: 'Cobrado dos veces por error.',
  }),
];

const CUOTAS: Record<string, DuesStatus> = {
  'mostrador-cuota-al-corriente': {
    estado: 'AL_CORRIENTE',
    puedeAcceder: true,
    diasRestantes: 18,
    hasta: '2026-09-26',
    planName: 'Mensual',
  } as DuesStatus,
  'mostrador-cuota-pausada': {
    estado: 'PAUSADA',
    puedeAcceder: false,
    diasRestantes: null,
    hasta: null,
    planName: 'Mensual',
  } as DuesStatus,
  'mostrador-cuota-vencida': {
    estado: 'VENCIDA',
    puedeAcceder: false,
    diasRestantes: -6,
    hasta: '2026-08-31',
    planName: 'Mensual',
  } as DuesStatus,
  'mostrador-sin-cuota': {
    estado: 'SIN_SUSCRIPCION',
    puedeAcceder: false,
    diasRestantes: null,
    hasta: null,
    planName: null,
  } as DuesStatus,
};

// --- Socios ---------------------------------------------------------------

export async function crearSocio(gymId: string, datos: CreateMemberInput): Promise<Member> {
  const caso = casoActual();
  if (!esMio(caso)) return crearSocioReal(gymId, datos);
  if (caso === 'mostrador-alta-error') throw new Error('Ya hay un socio con ese correo.');
  return { ...SOCIO, ...datos, memberNumber: 129 } as Member;
}

export async function actualizarSocio(
  gymId: string,
  id: string,
  datos: UpdateMemberInput,
): Promise<Member> {
  const caso = casoActual();
  if (!esMio(caso)) return actualizarSocioReal(gymId, id, datos);
  return { ...SOCIO, id, ...datos } as Member;
}

export async function darDeBajaSocio(gymId: string, id: string): Promise<Member> {
  const caso = casoActual();
  if (!esMio(caso)) return darDeBajaSocioReal(gymId, id);
  return { ...SOCIO, id, status: 'inactive', leftAt: '2026-09-08' };
}

export async function reactivarSocio(gymId: string, id: string): Promise<Member> {
  const caso = casoActual();
  if (!esMio(caso)) return reactivarSocioReal(gymId, id);
  return { ...SOCIO, id, status: 'active', leftAt: null };
}

export async function invitarSocio(gymId: string, id: string): Promise<Invitation> {
  const caso = casoActual();
  if (!esMio(caso)) return invitarSocioReal(gymId, id);
  return { id: 'i1', email: SOCIO.email, role: 'member' } as Invitation;
}

export async function exportarDatos(gymId: string, id: string): Promise<unknown> {
  const caso = casoActual();
  if (!esMio(caso)) return exportarDatosReal(gymId, id);
  return { socio: SOCIO, pagos: [], accesos: [] };
}

export async function eliminarSocio(gymId: string, id: string): Promise<{ ok: true }> {
  const caso = casoActual();
  if (!esMio(caso)) return eliminarSocioReal(gymId, id);
  // NO se borra nada: es una vista previa.
  return { ok: true };
}

// --- Cuota ----------------------------------------------------------------

export async function cargarCuotaDeSocio(gymId: string, id: string): Promise<DuesStatus> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarCuotaDeSocioReal(gymId, id);
  return CUOTAS[caso ?? ''] ?? CUOTAS['mostrador-cuota-al-corriente']!;
}

export async function darDeAltaCuota(
  gymId: string,
  id: string,
  datos: CreateSubscriptionInput,
): Promise<Subscription> {
  const caso = casoActual();
  if (!esMio(caso)) return darDeAltaCuotaReal(gymId, id, datos);
  return { id: 's1', planId: datos.planId, planName: 'Mensual' } as Subscription;
}

export async function congelarCuota(gymId: string, id: string): Promise<Subscription> {
  const caso = casoActual();
  if (!esMio(caso)) return congelarCuotaReal(gymId, id);
  return { id: 's1', status: 'paused' } as Subscription;
}

export async function reanudarCuota(gymId: string, id: string): Promise<Subscription> {
  const caso = casoActual();
  if (!esMio(caso)) return reanudarCuotaReal(gymId, id);
  return { id: 's1', status: 'active' } as Subscription;
}

export async function darDeBajaCuota(gymId: string, id: string): Promise<void> {
  const caso = casoActual();
  if (!esMio(caso)) return darDeBajaCuotaReal(gymId, id);
}

// --- Cobros ---------------------------------------------------------------

export async function cargarPagos(gymId: string, id: string): Promise<Payment[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarPagosReal(gymId, id);
  return caso === 'mostrador-sin-pagos' ? [] : PAGOS;
}

export async function registrarPago(
  gymId: string,
  id: string,
  datos: RegisterPaymentInput,
): Promise<unknown> {
  const caso = casoActual();
  if (!esMio(caso)) return registrarPagoReal(gymId, id, datos);
  return { payment: pago(datos as Partial<Payment>) };
}

export async function anularPago(gymId: string, pagoId: string, motivo: string): Promise<Payment> {
  const caso = casoActual();
  if (!esMio(caso)) return anularPagoReal(gymId, pagoId, motivo);
  return pago({ id: pagoId, voidedAt: '2026-09-08T10:00:00.000Z', voidReason: motivo });
}

// --- Planes ---------------------------------------------------------------

export async function cargarPlanes(gymId: string): Promise<Plan[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarPlanesReal(gymId);
  return caso === 'mostrador-sin-planes' ? [] : PLANES;
}

export async function crearPlan(gymId: string, datos: CreatePlanInput): Promise<Plan> {
  const caso = casoActual();
  if (!esMio(caso)) return crearPlanReal(gymId, datos);
  return plan({ id: 'p9', ...datos, activeSubscriptions: 0 });
}

export async function actualizarPlan(
  gymId: string,
  id: string,
  datos: UpdatePlanInput,
): Promise<Plan> {
  const caso = casoActual();
  if (!esMio(caso)) return actualizarPlanReal(gymId, id, datos);
  return plan({ id, ...datos });
}

export async function archivarPlan(gymId: string, id: string): Promise<Plan> {
  const caso = casoActual();
  if (!esMio(caso)) return archivarPlanReal(gymId, id);
  return plan({ id, status: 'archived' });
}
