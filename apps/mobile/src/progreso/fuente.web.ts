import type { BodyMetric } from '@gymlab/contracts';
import { cargarProgresoReal } from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DE PROGRESO. SOLO WEB, SOLO CON LA VARIABLE, SOLO ?vista=. │
 * │                                                                          │
 * │ Sin `?vista=` esto es la fuente de verdad, tal cual. Y no viaja: el      │
 * │ fichero es `.web.ts`, asi que en iOS y Android Metro coge `fuente.ts`.   │
 * │                                                                          │
 * │ Son numeros inventados de una persona que no existe. El fixture de       │
 * │ desarrollo tiene CERO mediciones para la socia con cuenta, asi que no    │
 * │ hay historial real que reproducir — y no se inventa uno en la base de    │
 * │ datos solo para poder hacer capturas.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

let contador = 0;

function medicion(
  iso: string,
  valores: Partial<Record<
    'weightKg' | 'bodyFatPercent' | 'chestCm' | 'waistCm' | 'hipCm' | 'armCm' | 'thighCm',
    number | null
  >>,
  notes: string | null = null,
): BodyMetric {
  contador += 1;
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(contador).padStart(12, '0')}`,
    measuredAt: iso,
    weightKg: null,
    bodyFatPercent: null,
    chestCm: null,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    notes,
    consentVersion: 'demo',
    ...valores,
  } as BodyMetric;
}

/*
 * La API entrega de la mas reciente a la mas antigua. Las listas de aqui van
 * en ese mismo orden a proposito: si la pantalla se apoyara sin querer en un
 * orden ascendente, la preview lo enseñaria.
 */

const UNA = [medicion('2026-08-24T08:30:00.000Z', { weightKg: 71.4, waistCm: 79, bodyFatPercent: 18.2 })];

const DOS = [
  medicion('2026-08-24T08:30:00.000Z', { weightKg: 71.4, waistCm: 79, bodyFatPercent: 18.2 }),
  medicion('2026-07-27T09:00:00.000Z', { weightKg: 72.6, waistCm: 81, bodyFatPercent: 19.1 }),
];

/** Nueve mediciones mensuales, con algo de ruido. El caso normal de un año. */
const VARIAS = [
  medicion('2026-08-24T08:30:00.000Z', { weightKg: 71.4, waistCm: 79, bodyFatPercent: 18.2, armCm: 32.5 }),
  medicion('2026-07-27T09:00:00.000Z', { weightKg: 72.6, waistCm: 81, bodyFatPercent: 19.1, armCm: 32.1 }),
  medicion('2026-06-22T08:45:00.000Z', { weightKg: 72.1, waistCm: 80.5, bodyFatPercent: 19.4 }),
  medicion('2026-05-25T09:15:00.000Z', { weightKg: 73.3, waistCm: 82, bodyFatPercent: 20.1, armCm: 31.8 }),
  medicion('2026-04-20T08:30:00.000Z', { weightKg: 73.9, waistCm: 82.5, bodyFatPercent: 20.6 }),
  medicion('2026-03-23T09:00:00.000Z', { weightKg: 74.2, waistCm: 83, bodyFatPercent: 21.0, armCm: 31.5 }),
  medicion('2026-02-16T08:40:00.000Z', { weightKg: 74.8, waistCm: 84, bodyFatPercent: 21.3 }),
  medicion('2026-01-19T09:10:00.000Z', { weightKg: 75.1, waistCm: 84.5, bodyFatPercent: 21.8, armCm: 31.2 }),
  medicion('2025-12-15T08:50:00.000Z', { weightKg: 75.6, waistCm: 85, bodyFatPercent: 22.1 }),
];

/** El mismo numero siempre: el dominio degenerado, en pantalla. */
const CONSTANTE = [
  medicion('2026-08-24T08:30:00.000Z', { weightKg: 70 }),
  medicion('2026-07-27T09:00:00.000Z', { weightKg: 70 }),
  medicion('2026-06-22T08:45:00.000Z', { weightKg: 70 }),
  medicion('2026-05-25T09:15:00.000Z', { weightKg: 70 }),
];

/**
 * Intervalos MUY desiguales, y un valor fuera de escala.
 *
 * Cuatro mediciones en tres semanas, y luego catorce meses de nada. Es el caso
 * que demuestra que la X sale del tiempo y no del indice: si se repartieran a
 * distancias iguales, el parón mediria lo mismo que una semana.
 */
const IRREGULAR = [
  medicion('2026-08-24T08:30:00.000Z', { weightKg: 71.4 }),
  medicion('2026-08-17T08:30:00.000Z', { weightKg: 71.9 }),
  medicion('2026-08-10T08:30:00.000Z', { weightKg: 72.3 }),
  medicion('2026-08-03T08:30:00.000Z', { weightKg: 72.8 }),
  medicion('2025-06-11T10:00:00.000Z', { weightKg: 84.5 }),
];

/**
 * Diferencias minusculas: 200 gramos en cuatro meses.
 *
 * Sin el `spanMinimo` del dominio, esto se dibujaria como un desplome.
 */
const CASI_IGUAL = [
  medicion('2026-08-24T08:30:00.000Z', { weightKg: 70.1 }),
  medicion('2026-07-27T09:00:00.000Z', { weightKg: 70.2 }),
  medicion('2026-06-22T08:45:00.000Z', { weightKg: 70.0 }),
  medicion('2026-05-25T09:15:00.000Z', { weightKg: 70.2 }),
];

/**
 * Huecos por todas partes: cada dia se midio una cosa distinta.
 *
 * El peso tiene tres puntos, la cintura dos y el pecho uno. Cada medida
 * necesita SU serie: rellenar los huecos con ceros dibujaria caidas a cero
 * centimetros.
 */
const CAMPOS_NULOS = [
  medicion('2026-08-24T08:30:00.000Z', { weightKg: 71.4 }),
  medicion('2026-07-27T09:00:00.000Z', { waistCm: 79, chestCm: 96 }),
  medicion('2026-06-22T08:45:00.000Z', { weightKg: 72.1, waistCm: 80.5 }),
  medicion('2026-05-25T09:15:00.000Z', { weightKg: 73.3 }, 'Medida despues de entrenar.'),
];

type Guion =
  | 'vacio'
  | 'una'
  | 'dos'
  | 'varias'
  | 'constante'
  | 'irregular'
  | 'casi-igual'
  | 'campos-nulos'
  | 'cargando'
  | 'error';

const CASOS: Record<string, Guion> = {
  // El fixture real: la socia con cuenta tiene CERO mediciones. Es el caso que
  // de verdad se va a ver, no el mas favorable.
  'progreso-vacio': 'vacio',
  'progreso-una': 'una',
  'progreso-dos': 'dos',
  'progreso-varias': 'varias',
  'progreso-constante': 'constante',
  'progreso-intervalos-irregulares': 'irregular',
  // No estaba en la lista minima: es el caso que falsifica el `spanMinimo` del
  // dominio, y sin el no se puede ver si la escala exagera.
  'progreso-casi-igual': 'casi-igual',
  'progreso-campos-nulos': 'campos-nulos',
  'progreso-cargando': 'cargando',
  'progreso-error': 'error',
};

function casoActual(): Guion | null {
  if (!HABILITADA) return null;
  const nombre = new URLSearchParams(window.location.search).get('vista');
  return nombre ? (CASOS[nombre] ?? null) : null;
}

export async function cargarProgreso(): Promise<readonly BodyMetric[]> {
  const caso = casoActual();
  if (!caso) return cargarProgresoReal();

  switch (caso) {
    case 'cargando':
      return new Promise<readonly BodyMetric[]>(() => undefined);
    case 'error':
      throw new Error('progreso de muestra: fallo simulado');
    case 'vacio':
      return [];
    case 'una':
      return UNA;
    case 'dos':
      return DOS;
    case 'varias':
      return VARIAS;
    case 'constante':
      return CONSTANTE;
    case 'irregular':
      return IRREGULAR;
    case 'casi-igual':
      return CASI_IGUAL;
    case 'campos-nulos':
      return CAMPOS_NULOS;
  }
}
