import type { AssignedMember, AssignedRoutine, BodyMetric } from '@gymlab/contracts';
import {
  cargarMiSocioReal,
  cargarMisSociosReal,
  cargarProgresoReal,
  cargarRutinasReal,
} from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DEL ENTRENADOR. SOLO WEB, SOLO CON LA VARIABLE, SOLO ?vista=│
 * │                                                                          │
 * │ Sirve para MIRAR la lista y la ficha —y medirlas— sin depender de que    │
 * │ haya asignaciones sembradas. Sin `?vista=` reenvia a la API tal cual.    │
 * │                                                                          │
 * │ NINGUN DATO ES REAL. Los pesos y las medidas son inventados y NO salen   │
 * │ de la ficha de nadie: son datos de salud y no se copian ni para una      │
 * │ captura.                                                                 │
 * │                                                                          │
 * │ `.web.ts`: en iOS y Android Metro coge `fuente.ts`. Lo comprueba el gate │
 * │ de aislamiento.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

function asignado(parcial: Partial<AssignedMember>): AssignedMember {
  return {
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
    hasAccount: true,
    assignmentId: '11111111-1111-4111-8111-111111111111',
    assignedAt: '2026-05-04',
    ...parcial,
  } as AssignedMember;
}

const MIS_SOCIOS: AssignedMember[] = [
  asignado({}),
  asignado({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    memberNumber: 47,
    firstName: 'Socio',
    lastName: 'del Puerto',
    email: null,
    phone: null,
    assignedAt: '2026-06-19',
  }),
  asignado({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    memberNumber: 205,
    firstName: 'Alguien',
    lastName: 'Álvarez',
    assignedAt: '2026-02-02',
  }),
];

const RUTINAS: AssignedRoutine[] = [
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Fuerza · tren superior',
    description: null,
    items: [{}, {}, {}, {}, {}],
    activeAssignments: 4,
    status: 'active',
    assignmentId: '22222222-2222-4222-8222-222222222222',
    assignedAt: '2026-07-01',
  } as AssignedRoutine,
];

const PROGRESO: BodyMetric[] = [
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    measuredAt: '2026-08-28T09:15:00.000Z',
    weightKg: 63.4,
    bodyFatPercent: 22.1,
    chestCm: null,
    waistCm: 71,
    hipCm: null,
    armCm: null,
    thighCm: null,
    notes: null,
    consentVersion: '1',
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-dddddddddddd',
    measuredAt: '2026-07-14T09:00:00.000Z',
    weightKg: 64.8,
    bodyFatPercent: null,
    chestCm: null,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    notes: null,
    consentVersion: '1',
  },
];

function casoActual(): string | null {
  if (!HABILITADA) return null;
  return new URLSearchParams(window.location.search).get('vista');
}

export async function cargarMisSocios(): Promise<AssignedMember[]> {
  const caso = casoActual();
  if (!caso?.startsWith('trainer-')) return cargarMisSociosReal();
  if (caso === 'trainer-cargando') return new Promise<AssignedMember[]>(() => undefined);
  if (caso === 'trainer-error') throw new Error('socios de muestra: fallo simulado');
  return caso === 'trainer-vacio' ? [] : MIS_SOCIOS;
}

export async function cargarMiSocio(memberId: string): Promise<AssignedMember> {
  const caso = casoActual();
  if (!caso?.startsWith('trainer-')) return cargarMiSocioReal(memberId);
  if (caso === 'trainer-socio-error') throw new Error('ficha de muestra: fallo simulado');
  return MIS_SOCIOS.find((s) => s.id === memberId) ?? MIS_SOCIOS[0]!;
}

export async function cargarRutinas(
  gymId: string,
  memberId: string,
): Promise<AssignedRoutine[]> {
  const caso = casoActual();
  if (!caso?.startsWith('trainer-')) return cargarRutinasReal(gymId, memberId);
  return caso === 'trainer-socio-sin-datos' ? [] : RUTINAS;
}

export async function cargarProgreso(gymId: string, memberId: string): Promise<BodyMetric[]> {
  const caso = casoActual();
  if (!caso?.startsWith('trainer-')) return cargarProgresoReal(gymId, memberId);
  return caso === 'trainer-socio-sin-datos' ? [] : PROGRESO;
}
