import type { OwnRoutine, RoutineItem } from '@gymlab/contracts';
import { cargarRutinasReal } from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DE RUTINA. SOLO WEB, SOLO CON LA VARIABLE, SOLO CON ?vista=.│
 * │                                                                          │
 * │ Sin `?vista=` esto es la fuente de verdad, tal cual. Y no viaja: el      │
 * │ fichero es `.web.ts`, asi que en iOS y Android Metro coge `fuente.ts`.   │
 * │                                                                          │
 * │ Los nombres de ejercicio son reales del catalogo de plataforma —son      │
 * │ nombres de ejercicio, no de personas— y los de rutina son los del        │
 * │ fixture. No hay ningun dato personal aqui.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

function item(
  nombre: string,
  position: number,
  sets: number,
  reps: string,
  restSeconds: number | null = 90,
  notes: string | null = null,
): RoutineItem {
  return {
    id: `eeeeeeee-eeee-4eee-8eee-${String(position).padStart(12, '0')}`,
    // Nulo a proposito: es como llega un ejercicio que el gimnasio borro de su
    // biblioteca. El nombre sobrevive copiado y la pantalla no debe notarlo.
    exerciseId: null,
    exerciseName: nombre,
    position,
    sets,
    reps,
    restSeconds,
    notes,
  } as RoutineItem;
}

function rutina(
  id: string,
  nombre: string,
  descripcion: string | null,
  ejercicios: RoutineItem[],
): OwnRoutine {
  return {
    id,
    name: nombre,
    description: descripcion,
    items: ejercicios,
    status: 'active',
    assignmentId: `ffffffff-ffff-4fff-8fff-${id.slice(-12)}`,
    assignedAt: '2026-08-19T22:29:17.703Z',
  } as OwnRoutine;
}

/** La nota mas larga que el contrato admite: 300 caracteres. */
const NOTA_AL_LIMITE =
  'Baja despacio y controla los tres primeros centimetros: si notas que el hombro se va hacia ' +
  'delante, para la serie ahi aunque te queden repeticiones. Prefiero cuatro series limpias que ' +
  'seis regulares. Si un dia el banco esta ocupado, cambialo por mancuernas y me lo cuentas el ' +
  'jueves, que lo ajustamos.';

/*
 * Los dos nombres del fixture de desarrollo, con sus cuentas reales de
 * ejercicios: "Fuerza principiantes" lleva 5 y "Movilidad de hombro" lleva 3,
 * las dos asignadas con 127 milisegundos de diferencia.
 */
const FUERZA = rutina(
  '11111111-1111-4111-8111-111111111111',
  'Fuerza principiantes',
  'Tres dias por semana, cuerpo completo',
  [
    item('Aperturas con mancuernas', 1, 3, '8', 60, 'Calentar bien antes de la primera serie'),
    item('Contractor de pecho', 2, 4, '10', 90),
    item('Cruces en polea', 3, 3, '12', 120),
    item('Flexiones', 4, 4, '15', 60),
    item('Fondos en paralelas', 5, 3, '8-10', 90),
  ],
);

const MOVILIDAD = rutina(
  '22222222-2222-4222-8222-222222222222',
  'Movilidad de hombro',
  'Rehabilitacion, sin carga',
  [
    item('Rotacion externa con goma', 1, 3, '15', 60),
    item('Dislocaciones con palo', 2, 3, '10', 90),
    item('Face pull en polea', 3, 3, '12', 120),
  ],
);

/** 120 caracteres: el maximo que admite `name`. */
const NOMBRE_AL_LIMITE = rutina(
  '33333333-3333-4333-8333-333333333333',
  'Hipertrofia de tren superior con enfasis en dorsal ancho y trabajo accesorio de hombro ' +
    'posterior para los meses de invierno',
  'Bloque largo, cuatro dias por semana, con progresion de carga semanal y descarga cada cuatro ' +
    'semanas segun sensaciones',
  [
    item('Dominadas con lastre', 1, 4, '6-8', 180),
    item('Remo con barra', 2, 4, '8', 120),
    item('Face pull en polea', 3, 3, '15', 60),
  ],
);

/** Sin descanso en ninguno: `restSeconds` es anulable y ya pasa en el fixture. */
const SIN_DESCANSO = rutina(
  '44444444-4444-4444-8444-444444444444',
  'Acondicionamiento general',
  null,
  [
    item('Aperturas con mancuernas', 1, 3, '12', null),
    item('Zancadas', 2, 3, '10', null),
    item('Plancha abdominal', 3, 3, '40 s', null),
  ],
);

const CON_NOTA_LARGA = rutina(
  '55555555-5555-4555-8555-555555555555',
  'Fuerza principiantes',
  'Tres dias por semana, cuerpo completo',
  [
    item('Press de banca', 1, 4, '8', 120, NOTA_AL_LIMITE),
    item('Remo con barra', 2, 4, '10', 90, 'Espalda plana. Si tiras con los brazos, baja el peso.'),
    item('Elevaciones laterales', 3, 3, '12', 60),
  ],
);

/*
 * `reps` admite 30 caracteres de texto libre: "al fallo", "8-10", "30 s por
 * lado". No es un entero y esta comprobado en datos reales, asi que hay un
 * caso dedicado a ver que no rompe la fila.
 */
const REPS_LARGAS = rutina('66666666-6666-4666-8666-666666666666', 'Circuito metabolico', null, [
  item('Burpees', 1, 4, 'al fallo', 60),
  item('Zancadas caminando', 2, 3, '30 s por lado, sin parar', 90),
  item('Remo en maquina', 3, 2, '500 m', null),
  item('Plancha abdominal', 4, 3, 'maximo tiempo', 45),
]);

/** Doce ejercicios, para ver como envejece la lista al crecer hacia abajo. */
const LARGA = rutina('77777777-7777-4777-8777-777777777777', 'Hipertrofia tren superior', null, [
  item('Press de banca', 1, 4, '8', 120),
  item('Press inclinado con mancuernas', 2, 4, '10', 90),
  item('Aperturas con mancuernas', 3, 3, '12', 60),
  item('Cruces en polea', 4, 3, '15', 60),
  item('Dominadas', 5, 4, '6-8', 120, 'Si no llegas a seis, usa la goma verde'),
  item('Remo con barra', 6, 4, '8', 120),
  item('Jalon al pecho', 7, 3, '10', 90),
  item('Face pull en polea', 8, 3, '15', 60),
  item('Press militar', 9, 4, '8', 120),
  item('Elevaciones laterales', 10, 4, '12', 45),
  item('Curl con barra Z', 11, 3, '10', 60),
  item('Extension de triceps en polea', 12, 3, '12', 60),
]);

type Guion = 'una' | 'varias' | 'nombre-largo' | 'nota-larga' | 'sin-descanso' | 'reps-largas' |
  'larga' | 'fixture-real' | 'vacia' | 'cargando' | 'error';

const CASOS: Record<string, Guion> = {
  'rutina-una': 'una',
  'rutina-varias': 'varias',
  'rutina-nombre-largo': 'nombre-largo',
  'rutina-nota-larga': 'nota-larga',
  'rutina-sin-descanso': 'sin-descanso',
  // `reps` es texto libre de hasta 30 caracteres. No esta en la lista minima
  // pero es el campo del contrato que mas facil rompe una fila.
  'rutina-reps-largas': 'reps-largas',
  // Doce ejercicios: la pregunta de "como envejece al crecer verticalmente".
  'rutina-larga': 'larga',
  /*
   * EXACTAMENTE la estructura del fixture de desarrollo: dos rutinas vigentes,
   * de 5 y 3 ejercicios, con una sola nota y con "8-10" entre las
   * repeticiones. Es la pantalla que de verdad va a ver la socia.
   */
  'rutina-fixture-real': 'fixture-real',
  'rutina-vacia': 'vacia',
  'rutina-cargando': 'cargando',
  'rutina-error': 'error',
};

function casoActual(): Guion | null {
  if (!HABILITADA) return null;
  const nombre = new URLSearchParams(window.location.search).get('vista');
  return nombre ? (CASOS[nombre] ?? null) : null;
}

export async function cargarRutinas(): Promise<readonly OwnRoutine[]> {
  const caso = casoActual();
  if (!caso) return cargarRutinasReal();

  switch (caso) {
    case 'cargando':
      return new Promise<readonly OwnRoutine[]>(() => undefined);
    case 'error':
      throw new Error('rutina de muestra: fallo simulado');
    case 'vacia':
      return [];
    case 'una':
      return [FUERZA];
    case 'nombre-largo':
      return [NOMBRE_AL_LIMITE, FUERZA];
    case 'nota-larga':
      return [CON_NOTA_LARGA];
    case 'sin-descanso':
      return [SIN_DESCANSO];
    case 'reps-largas':
      return [REPS_LARGAS];
    case 'larga':
      return [LARGA];
    case 'varias':
    case 'fixture-real':
      // El servidor ordena por `assigned_at DESC`: Movilidad va primero.
      return [MOVILIDAD, FUERZA];
  }
}
