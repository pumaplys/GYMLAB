import { api } from '../api/cliente';
import type {
  HealthConsentStatus,
  Member,
  OwnAccessEventList,
  OwnPaymentList,
} from '@gymlab/contracts';
import { POR_PAGINA } from './logica';

/**
 * De donde salen los datos de Perfil y sus tres secciones. La via de verdad.
 *
 * Cuatro llamadas independientes, una por pantalla: Perfil no pide el
 * historial de pagos para enseñar un nombre.
 */
export async function cargarFichaReal(): Promise<Member> {
  return api.yo.fichaDeSocio();
}

export async function cargarPagosReal(pagina: number): Promise<OwnPaymentList> {
  return api.yo.misPagos({ page: pagina, pageSize: POR_PAGINA });
}

export async function cargarAccesosReal(pagina: number): Promise<OwnAccessEventList> {
  return api.yo.misAccesos({ page: pagina, pageSize: POR_PAGINA });
}

export async function cargarPrivacidadReal(): Promise<HealthConsentStatus> {
  return api.yo.consentimientoDeSalud();
}

/** Aceptar la version vigente. El servidor comprueba que es la de ahora. */
export async function aceptarPrivacidadReal(version: string): Promise<HealthConsentStatus> {
  return api.yo.aceptarConsentimientoDeSalud(version);
}

/** Retirarlo. Es un derecho: ni motivo ni permiso del gimnasio. */
export async function retirarPrivacidadReal(): Promise<HealthConsentStatus> {
  return api.yo.revocarConsentimientoDeSalud();
}
