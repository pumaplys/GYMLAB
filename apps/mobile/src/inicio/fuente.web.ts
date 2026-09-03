import type { BodyMetric, DuesStatus, Member, OwnRoutine } from '@gymlab/contracts';
import type { DatosEsenciales } from './logica';
import { cargarEsencialesReal, cargarProgresoReal, cargarRutinasReal } from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DE INICIO. SOLO WEB, SOLO CON LA VARIABLE, SOLO CON ?vista=.│
 * │                                                                          │
 * │ Sin `?vista=` esto es la fuente de verdad, tal cual. Y no viaja: el      │
 * │ fichero es `.web.ts`, asi que en iOS y Android Metro coge `fuente.ts`.   │
 * │                                                                          │
 * │ Los datos son ficticios y se les nota: "Socia de Muestra", "Gimnasio de  │
 * │ Muestra". Las CANTIDADES si imitan al fixture —dos rutinas, cero         │
 * │ mediciones en el caso normal— para que la preview enseñe la pantalla que │
 * │ de verdad se va a ver.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

const FICHA: Member = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  memberNumber: 128,
  firstName: 'Socia',
  lastName: 'de Muestra',
  email: null,
  phone: null,
  birthDate: null,
  status: 'active',
  joinedAt: '2026-01-10',
  leftAt: null,
  hasAccount: true,
} as Member;

function cuota(parcial: Partial<DuesStatus>): DuesStatus {
  return {
    estado: 'AL_CORRIENTE',
    puedeAcceder: true,
    diasRestantes: 17,
    hasta: '2026-09-20',
    planName: 'Mensual',
    ...parcial,
  } as DuesStatus;
}

function item(nombre: string, position: number, sets: number, reps: string) {
  return {
    id: `eeeeeeee-eeee-4eee-8eee-${String(position).padStart(12, '0')}`,
    exerciseId: null,
    exerciseName: nombre,
    position,
    sets,
    reps,
    restSeconds: 60,
    notes: null,
  };
}

function rutina(id: string, nombre: string, ejercicios: ReturnType<typeof item>[]): OwnRoutine {
  return {
    id,
    name: nombre,
    description: 'Rutina de muestra para la vista previa.',
    items: ejercicios,
    status: 'active',
    assignmentId: `ffffffff-ffff-4fff-8fff-${id.slice(-12)}`,
    assignedAt: '2026-08-19T09:00:00.000Z',
  } as OwnRoutine;
}

const FUERZA = rutina('11111111-1111-4111-8111-111111111111', 'Fuerza principiantes', [
  item('Sentadilla con barra', 1, 4, '8'),
  item('Press de banca', 2, 4, '8'),
  item('Remo con barra', 3, 3, '10'),
  item('Elevaciones laterales', 4, 3, '12'),
  item('Plancha abdominal', 5, 3, '40 s'),
]);

const MOVILIDAD = rutina('22222222-2222-4222-8222-222222222222', 'Movilidad de hombro', [
  item('Rotacion externa con goma', 1, 3, '15'),
  item('Dislocaciones con palo', 2, 3, '10'),
  item('Face pull en polea', 3, 3, '12'),
]);

function medicion(fecha: string, peso: number | null, grasa: number | null, cintura: number | null) {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${fecha.replace(/-/g, '')}0000`,
    measuredAt: fecha,
    weightKg: peso,
    bodyFatPercent: grasa,
    chestCm: null,
    waistCm: cintura,
    hipCm: null,
    armCm: null,
    thighCm: null,
    notes: null,
    consentVersion: 'demo',
  } as BodyMetric;
}

interface CasoDeInicio {
  esenciales: 'ok' | 'nunca-termina' | 'falla';
  cuota: DuesStatus;
  rutinas: 'ok' | 'vacio' | 'una' | 'falla';
  progreso: 'con-datos' | 'vacio' | 'falla';
}

const CASOS: Record<string, CasoDeInicio> = {
  // El caso completo: dos rutinas y mediciones, para ver la pantalla llena.
  'inicio-completo': { esenciales: 'ok', cuota: cuota({}), rutinas: 'ok', progreso: 'con-datos' },
  // Una sola rutina: es el unico caso en el que puede haber vista previa de
  // ejercicios, porque con varias no se elige ninguna.
  'inicio-una-rutina': { esenciales: 'ok', cuota: cuota({}), rutinas: 'una', progreso: 'con-datos' },
  'inicio-sin-rutina': { esenciales: 'ok', cuota: cuota({}), rutinas: 'vacio', progreso: 'con-datos' },
  // Lo que de verdad devuelve el fixture hoy: cero mediciones.
  'inicio-sin-progreso': { esenciales: 'ok', cuota: cuota({}), rutinas: 'ok', progreso: 'vacio' },
  /*
   * EXACTAMENTE lo que devuelve el fixture hoy: dos rutinas y CERO
   * mediciones. Es el caso que de verdad va a ver la socia, no el mas
   * favorable, y por eso tiene su propia captura.
   */
  'inicio-fixture-real': { esenciales: 'ok', cuota: cuota({}), rutinas: 'ok', progreso: 'vacio' },
  'inicio-cuota-vencida': {
    esenciales: 'ok',
    cuota: cuota({ estado: 'VENCIDA', puedeAcceder: false, diasRestantes: -4, hasta: '2026-08-28' }),
    rutinas: 'ok',
    progreso: 'vacio',
  },
  'inicio-cargando': {
    esenciales: 'nunca-termina',
    cuota: cuota({}),
    rutinas: 'ok',
    progreso: 'vacio',
  },
  'inicio-error-esencial': { esenciales: 'falla', cuota: cuota({}), rutinas: 'ok', progreso: 'vacio' },
  'inicio-error-rutina': { esenciales: 'ok', cuota: cuota({}), rutinas: 'falla', progreso: 'con-datos' },
};

function casoActual(): CasoDeInicio | null {
  if (!HABILITADA) return null;
  const nombre = new URLSearchParams(window.location.search).get('vista');
  return nombre ? (CASOS[nombre] ?? null) : null;
}

export async function cargarEsenciales(): Promise<DatosEsenciales> {
  const caso = casoActual();
  if (!caso) return cargarEsencialesReal();
  if (caso.esenciales === 'nunca-termina') return new Promise<DatosEsenciales>(() => undefined);
  if (caso.esenciales === 'falla') throw new Error('inicio de muestra: fallo esencial simulado');
  return { ficha: FICHA, cuota: caso.cuota };
}

export async function cargarRutinas(): Promise<readonly OwnRoutine[]> {
  const caso = casoActual();
  if (!caso) return cargarRutinasReal();
  if (caso.rutinas === 'falla') throw new Error('inicio de muestra: fallo de rutinas simulado');
  if (caso.rutinas === 'vacio') return [];
  if (caso.rutinas === 'una') return [FUERZA];
  return [MOVILIDAD, FUERZA];
}

export async function cargarProgreso(): Promise<readonly BodyMetric[]> {
  const caso = casoActual();
  if (!caso) return cargarProgresoReal();
  if (caso.progreso === 'falla') throw new Error('inicio de muestra: fallo de progreso simulado');
  if (caso.progreso === 'vacio') return [];
  return [medicion('2026-08-24', 71.4, 18.2, 79), medicion('2026-07-27', 72.8, 19.1, 81)];
}
