import type { LegalData, PrivacyDocumentStatus, UpdateLegalDataInput } from '@gymlab/contracts';
import { ApiError } from '@gymlab/api-client';
import { cargarDocumentoReal, cargarLegalReal, guardarLegalReal } from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DE LA CONFIGURACION LEGAL.                                 │
 * │ SOLO WEB, SOLO CON LA VARIABLE, SOLO CON `?vista=`.                      │
 * │                                                                          │
 * │ Guardar NO ocurre: se devuelve lo que devolveria el servidor —los datos  │
 * │ ya con los cambios aplicados— y NO SE TOCA NADA.                         │
 * │                                                                          │
 * │ Los datos son inventados: `ejemplo.local` no es un dominio que exista, y │
 * │ el NIF no corresponde a ninguna sociedad real.                           │
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

/** Los casos de esta vista previa empiezan todos por `legal-`. */
const esMio = (caso: string | null) => caso?.startsWith('legal-') === true;

const COMPLETA: LegalData = {
  name: 'Gimnasio de Muestra',
  legalName: 'Gimnasio de Muestra, S. L.',
  taxId: 'B00000000',
  address: 'Calle de Muestra 1, 28001 Madrid',
  privacyEmail: 'privacidad@ejemplo.local',
  missing: [],
};

const INCOMPLETA: LegalData = {
  name: 'Gimnasio de Muestra',
  legalName: 'Gimnasio de Muestra, S. L.',
  taxId: null,
  address: null,
  privacyEmail: 'privacidad@ejemplo.local',
  missing: ['taxId', 'address'],
};

const PUBLICADO: PrivacyDocumentStatus = {
  state: 'publicado',
  expectedVersion: '2026-09-01-borrador',
  publishedVersion: '2026-09-01-borrador',
  publishedAt: '2026-06-10T09:00:00.000Z',
};

export async function cargarLegal(gymId: string): Promise<LegalData> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarLegalReal(gymId);
  if (caso === 'legal-cargando') return new Promise<LegalData>(() => undefined);
  if (caso === 'legal-error') throw new Error('configuracion de muestra: fallo simulado');
  return caso === 'legal-completa' ? COMPLETA : INCOMPLETA;
}

export async function guardarLegal(
  gymId: string,
  cambios: UpdateLegalDataInput,
): Promise<LegalData> {
  const caso = casoActual();
  if (!esMio(caso)) return guardarLegalReal(gymId, cambios);
  if (caso === 'legal-guardar-error') throw new ApiError(422, 'correo no valido');
  // Lo que devolveria el servidor. NO se guarda nada en ningun sitio.
  const base = caso === 'legal-completa' ? COMPLETA : INCOMPLETA;
  const datos: LegalData = { ...base, ...cambios };
  return {
    ...datos,
    missing: (['legalName', 'taxId', 'address', 'privacyEmail'] as const).filter(
      (c) => datos[c] === null || datos[c] === '',
    ),
  };
}

export async function cargarDocumento(gymId: string): Promise<PrivacyDocumentStatus> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarDocumentoReal(gymId);
  if (caso === 'legal-cargando') return new Promise<PrivacyDocumentStatus>(() => undefined);
  if (caso === 'legal-completa') return PUBLICADO;
  if (caso === 'legal-sin-version') {
    return {
      state: 'sin_version',
      expectedVersion: null,
      publishedVersion: null,
      publishedAt: null,
    };
  }
  return {
    state: 'falta_configuracion',
    expectedVersion: '2026-09-01-borrador',
    publishedVersion: null,
    publishedAt: null,
  };
}
