import type { DuesStatus, Member, MemberList } from '@gymlab/contracts';
import { buscarSociosReal, cargarCuotaReal, cargarSocioReal } from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DEL PANEL. SOLO WEB, SOLO CON LA VARIABLE, SOLO ?vista=.    │
 * │                                                                          │
 * │ Sirve para MIRAR la busqueda y la ficha —y medirlas— sin depender de que │
 * │ haya un gimnasio sembrado. Sin `?vista=` esto reenvia a la API tal cual. │
 * │                                                                          │
 * │ NINGUN DATO ES REAL: nombres inventados, correos en `.local` y un        │
 * │ teléfono de la reserva 600 000 000. Ninguna captura puede confundirse    │
 * │ con una persona.                                                         │
 * │                                                                          │
 * │ `.web.ts`: en iOS y Android Metro coge `fuente.ts`. Lo comprueba el gate │
 * │ de aislamiento.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

function socio(parcial: Partial<Member>): Member {
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
    ...parcial,
  } as Member;
}

const VARIOS: Member[] = [
  socio({}),
  socio({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    memberNumber: 47,
    firstName: 'Socio',
    lastName: 'del Puerto',
    email: null,
    phone: null,
    birthDate: null,
  }),
  socio({
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    memberNumber: 205,
    firstName: 'Persona',
    lastName: 'de Baja',
    status: 'inactive',
    leftAt: '2026-07-01',
    hasAccount: false,
  }),
];

/*
 * Las fechas van con su estado, no sueltas: una cuota «Vencida» que termina la
 * semana que viene se contradice a si misma, y esa contradiccion acabaria en
 * una captura que alguien mira para decidir si el texto esta bien.
 */
const CUOTAS: Record<string, Partial<DuesStatus>> = {
  'panel-socio': {
    estado: 'AL_CORRIENTE',
    puedeAcceder: true,
    diasRestantes: 19,
    hasta: '2026-09-25',
  },
  'panel-socio-por-vencer': {
    estado: 'POR_VENCER',
    puedeAcceder: true,
    diasRestantes: 3,
    hasta: '2026-09-09',
  },
  'panel-socio-vencida': {
    estado: 'VENCIDA',
    puedeAcceder: false,
    diasRestantes: -6,
    hasta: '2026-08-31',
  },
  'panel-socio-sin-cuota': {
    estado: 'SIN_SUSCRIPCION',
    puedeAcceder: false,
    diasRestantes: null,
    hasta: null,
    planName: null,
  },
};

function casoActual(): string | null {
  if (!HABILITADA) return null;
  return new URLSearchParams(window.location.search).get('vista');
}

export async function buscarSocios(gymId: string, consulta: string): Promise<MemberList> {
  const caso = casoActual();
  if (!caso?.startsWith('panel-')) return buscarSociosReal(gymId, consulta);

  if (caso === 'panel-buscar-cargando') return new Promise<MemberList>(() => undefined);
  if (caso === 'panel-buscar-error') throw new Error('búsqueda de muestra: fallo simulado');
  const items = caso === 'panel-buscar-vacio' ? [] : VARIOS;
  return { items, total: items.length, page: 1, pageSize: 25 };
}

export async function cargarSocio(gymId: string, memberId: string): Promise<Member> {
  const caso = casoActual();
  if (!caso?.startsWith('panel-socio')) return cargarSocioReal(gymId, memberId);
  if (caso === 'panel-socio-error') throw new Error('ficha de muestra: fallo simulado');
  return VARIOS.find((s) => s.id === memberId) ?? VARIOS[0]!;
}

export async function cargarCuota(gymId: string, memberId: string): Promise<DuesStatus> {
  const caso = casoActual();
  const parcial = caso ? CUOTAS[caso] : undefined;
  if (!parcial) return cargarCuotaReal(gymId, memberId);
  return {
    estado: 'AL_CORRIENTE',
    puedeAcceder: true,
    diasRestantes: 19,
    hasta: '2026-09-25',
    planName: 'Mensual',
    ...parcial,
  } as DuesStatus;
}
