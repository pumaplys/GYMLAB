import type {
  AssignedMember,
  AssignedRoutine,
  BodyMetric,
  HealthConsentStatus,
  RecordBodyMetricInput,
} from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * Lo que el area del entrenador le pide al servidor. Cuatro lecturas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS CUATRO ENDPOINTS YA EXISTIAN, Y LOS CUATRO SE PROTEGEN SOLOS.       │
 * │                                                                          │
 * │   GET /me/trainer/members                    @Roles('trainer')           │
 * │   GET /me/trainer/members/:id                @Roles('trainer')           │
 * │   GET /gyms/:g/members/:id/routines          owner, trainer              │
 * │   GET /gyms/:g/members/:id/progress          owner, trainer              │
 * │                                                                          │
 * │ Los dos ultimos admiten al entrenador, pero el SERVICIO comprueba ademas │
 * │ que el socio sea suyo: `asegurarAcceso` llama a `myMember` y devuelve    │
 * │ 404 si no lo es. Ni siquiera confirma que la ficha exista, que ya seria  │
 * │ filtrar informacion sobre socios ajenos.                                 │
 * │                                                                          │
 * │ O sea: aunque el gate de la app fallara, un entrenador no puede ver a un │
 * │ socio que no entrena. La app no es la que guarda esa puerta.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function cargarMisSociosReal(): Promise<AssignedMember[]> {
  return api.yo.misSocios();
}

export async function cargarMiSocioReal(memberId: string): Promise<AssignedMember> {
  return api.yo.miSocio(memberId);
}

export async function cargarRutinasReal(
  gymId: string,
  memberId: string,
): Promise<AssignedRoutine[]> {
  return api.entrenamiento.rutinasDeSocio(gymId, memberId);
}

export async function cargarProgresoReal(gymId: string, memberId: string): Promise<BodyMetric[]> {
  return api.progreso.historial(gymId, memberId);
}

/**
 * PARITY-4: registrar una medición y saber si se puede.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ENTRENADOR RESPETA EL CONSENTIMIENTO. NO LO CONCEDE.                  │
 * │                                                                          │
 * │   GET  /gyms/:g/members/:id/health-consent   owner, trainer   se LEE     │
 * │   POST /gyms/:g/members/:id/progress         owner, trainer   se ESCRIBE │
 * │                                                                          │
 * │ La API tiene ademas `POST` y `DELETE` de health-consent para el personal │
 * │ —pensados para recogerlo en el mostrador con el socio delante— y el      │
 * │ panel web NO LOS USA a proposito: un consentimiento que otorga otro en   │
 * │ tu nombre, sin que tu estes, no es consentimiento. Aqui tampoco se usan. │
 * │ El socio lo concede y lo retira desde su propia pantalla de privacidad.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function cargarConsentimientoReal(
  gymId: string,
  memberId: string,
): Promise<HealthConsentStatus> {
  return api.progreso.consentimientoDeSalud(gymId, memberId);
}

export async function registrarMedicionReal(
  gymId: string,
  memberId: string,
  medicion: RecordBodyMetricInput,
): Promise<BodyMetric> {
  return api.progreso.registrar(gymId, memberId, medicion);
}
