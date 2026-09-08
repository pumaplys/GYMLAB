import type {
  CreateMemberInput,
  CreateSubscriptionInput,
  DuesStatus,
  Member,
  Payment,
  Plan,
  CreatePlanInput,
  Invitation,
  RegisterPaymentInput,
  Subscription,
  UpdateMemberInput,
  UpdatePlanInput,
} from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * Socios, cuotas, cobros y planes: las llamadas de verdad, envueltas.
 *
 * Aqui no hay ninguna regla de negocio. Los envoltorios existen para que la
 * vista previa web pueda sustituir la fuente sin tocar una sola pantalla, y
 * para que ningun dato de muestra viaje al binario nativo.
 */

// --- Socios ---------------------------------------------------------------

export function crearSocioReal(gymId: string, datos: CreateMemberInput): Promise<Member> {
  return api.members.create(gymId, datos);
}

export function actualizarSocioReal(
  gymId: string,
  id: string,
  datos: UpdateMemberInput,
): Promise<Member> {
  return api.members.update(gymId, id, datos);
}

export function darDeBajaSocioReal(gymId: string, id: string): Promise<Member> {
  return api.members.deactivate(gymId, id);
}

export function reactivarSocioReal(gymId: string, id: string): Promise<Member> {
  return api.members.reactivate(gymId, id);
}

export function invitarSocioReal(gymId: string, id: string): Promise<Invitation> {
  return api.members.invite(gymId, id);
}

export function exportarDatosReal(gymId: string, id: string): Promise<unknown> {
  return api.members.exportData(gymId, id);
}

export function eliminarSocioReal(gymId: string, id: string): Promise<{ ok: true }> {
  return api.members.erase(gymId, id);
}

// --- Cuota ----------------------------------------------------------------

export function cargarCuotaDeSocioReal(gymId: string, id: string): Promise<DuesStatus> {
  return api.billing.dues(gymId, id);
}

export function darDeAltaCuotaReal(
  gymId: string,
  id: string,
  datos: CreateSubscriptionInput,
): Promise<Subscription> {
  return api.billing.subscribe(gymId, id, datos);
}

export function congelarCuotaReal(gymId: string, id: string): Promise<Subscription> {
  return api.billing.pause(gymId, id);
}

export function reanudarCuotaReal(gymId: string, id: string): Promise<Subscription> {
  return api.billing.resume(gymId, id);
}

export function darDeBajaCuotaReal(gymId: string, id: string): Promise<void> {
  return api.billing.cancel(gymId, id);
}

// --- Cobros ---------------------------------------------------------------

export function cargarPagosReal(gymId: string, id: string): Promise<Payment[]> {
  return api.billing.listPayments(gymId, id);
}

export function registrarPagoReal(
  gymId: string,
  id: string,
  datos: RegisterPaymentInput,
): Promise<unknown> {
  return api.billing.registerPayment(gymId, id, datos);
}

export function anularPagoReal(gymId: string, pagoId: string, motivo: string): Promise<Payment> {
  return api.billing.voidPayment(gymId, pagoId, motivo);
}

// --- Planes ---------------------------------------------------------------

export function cargarPlanesReal(gymId: string): Promise<Plan[]> {
  return api.billing.listPlans(gymId);
}

export function crearPlanReal(gymId: string, datos: CreatePlanInput): Promise<Plan> {
  return api.billing.createPlan(gymId, datos);
}

export function actualizarPlanReal(
  gymId: string,
  id: string,
  datos: UpdatePlanInput,
): Promise<Plan> {
  return api.billing.updatePlan(gymId, id, datos);
}

export function archivarPlanReal(gymId: string, id: string): Promise<Plan> {
  return api.billing.archivePlan(gymId, id);
}
