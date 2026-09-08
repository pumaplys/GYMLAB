import type {
  AssignedRoutine,
  CreateExerciseInput,
  CreateRoutineInput,
  Exercise,
  Routine,
  UpdateExerciseInput,
  UpdateRoutineInput,
} from '@gymlab/contracts';
import {
  actualizarEjercicioReal,
  actualizarRutinaReal,
  archivarRutinaReal,
  asignarRutinaReal,
  cargarEjerciciosReal,
  cargarRutinaReal,
  cargarRutinasDeSocioReal,
  cargarRutinasReal,
  crearEjercicioReal,
  crearRutinaReal,
  eliminarEjercicioReal,
  terminarAsignacionReal,
} from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DE ENTRENAMIENTO. SOLO WEB, SOLO CON LA VARIABLE, SOLO      │
 * │ CON `?vista=`.                                                           │
 * │                                                                          │
 * │ Sirve para MIRAR —y comprobar automaticamente— la biblioteca, el editor  │
 * │ de rutinas y la asignacion sin sembrar nada en ninguna base de datos.    │
 * │                                                                          │
 * │ LAS ESCRITURAS NO ESCRIBEN. Devuelven lo que devolveria el servidor y no │
 * │ tocan nada: son las unicas pantallas del movil que pueden borrar cosas,  │
 * │ y una vista previa que borrase de verdad seria mucho peor que no tenerla.│
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

/** Los casos de esta vista previa empiezan todos por `entrenamiento-`. */
const esMio = (caso: string | null) => caso?.startsWith('entrenamiento-') === true;

function ejercicio(parcial: Partial<Exercise>): Exercise {
  return {
    id: 'e1111111-1111-4111-8111-111111111111',
    name: 'Press de banca',
    muscleGroup: 'chest',
    equipment: 'Barra',
    fromTemplate: true,
    ...parcial,
  };
}

const EJERCICIOS: Exercise[] = [
  ejercicio({}),
  ejercicio({
    id: 'e2222222-2222-4222-8222-222222222222',
    name: 'Remo con barra',
    muscleGroup: 'back',
  }),
  ejercicio({
    id: 'e3333333-3333-4333-8333-333333333333',
    name: 'Sentadilla búlgara',
    muscleGroup: 'legs',
    equipment: 'Mancuernas',
    fromTemplate: false,
  }),
  ejercicio({
    id: 'e4444444-4444-4444-8444-444444444444',
    name: 'Plancha frontal',
    muscleGroup: 'core',
    equipment: null,
  }),
];

function rutina(parcial: Partial<Routine>): Routine {
  return {
    id: 'r1111111-1111-4111-8111-111111111111',
    name: 'Fuerza · tren superior',
    description: 'Tres días por semana, con descanso entre sesiones.',
    items: [
      {
        id: 'i1111111-1111-4111-8111-111111111111',
        exerciseId: 'e1111111-1111-4111-8111-111111111111',
        exerciseName: 'Press de banca',
        position: 0,
        sets: 4,
        reps: '8-10',
        restSeconds: 90,
        notes: null,
      },
      {
        id: 'i2222222-2222-4222-8222-222222222222',
        exerciseId: 'e2222222-2222-4222-8222-222222222222',
        exerciseName: 'Remo con barra',
        position: 1,
        sets: 4,
        reps: '10',
        restSeconds: 90,
        notes: 'Espalda recta, sin tirones.',
      },
    ],
    activeAssignments: 3,
    status: 'active',
    ...parcial,
  };
}

const RUTINAS: Routine[] = [
  rutina({}),
  rutina({
    id: 'r2222222-2222-4222-8222-222222222222',
    name: 'Movilidad y core',
    description: null,
    activeAssignments: 0,
  }),
  rutina({
    id: 'r3333333-3333-4333-8333-333333333333',
    name: 'Adaptación · principiantes',
    description: null,
    activeAssignments: 0,
    status: 'archived',
  }),
];

const DE_SOCIO: AssignedRoutine[] = [
  {
    ...rutina({}),
    assignmentId: 'a1111111-1111-4111-8111-111111111111',
    assignedAt: '2026-07-01',
  },
];

export async function cargarEjercicios(gymId: string): Promise<Exercise[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarEjerciciosReal(gymId);
  if (caso === 'entrenamiento-cargando') return new Promise<Exercise[]>(() => undefined);
  if (caso === 'entrenamiento-error') throw new Error('biblioteca de muestra: fallo simulado');
  return caso === 'entrenamiento-vacio' ? [] : EJERCICIOS;
}

export async function crearEjercicio(gymId: string, datos: CreateExerciseInput): Promise<Exercise> {
  const caso = casoActual();
  if (!esMio(caso)) return crearEjercicioReal(gymId, datos);
  return ejercicio({ id: 'e9999999-9999-4999-8999-999999999999', ...datos, fromTemplate: false });
}

export async function actualizarEjercicio(
  gymId: string,
  id: string,
  datos: UpdateExerciseInput,
): Promise<Exercise> {
  const caso = casoActual();
  if (!esMio(caso)) return actualizarEjercicioReal(gymId, id, datos);
  return ejercicio({ id, ...datos });
}

export async function eliminarEjercicio(gymId: string, id: string): Promise<void> {
  const caso = casoActual();
  if (!esMio(caso)) return eliminarEjercicioReal(gymId, id);
}

export async function cargarRutinas(gymId: string): Promise<Routine[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarRutinasReal(gymId);
  if (caso === 'entrenamiento-rutinas-vacio') return [];
  return RUTINAS;
}

export async function cargarRutina(gymId: string, id: string): Promise<Routine> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarRutinaReal(gymId, id);
  if (caso === 'entrenamiento-rutina-archivada') return rutina({ id, status: 'archived' });
  /*
   * Una rutina rota por un borrado ajeno: alguien quito «Remo con barra» de la
   * biblioteca y la fila conserva su nombre, sus series y sus notas pero ya no
   * apunta a nada. Es el caso que hace falta para poder MIRAR «Elegir
   * sustituto», y no se puede provocar sin borrar un ejercicio de verdad.
   */
  if (caso === 'entrenamiento-rutina-huerfana') {
    const base = rutina({ id });
    return {
      ...base,
      items: base.items.map((i, n) => (n === 1 ? { ...i, exerciseId: null } : i)),
    };
  }
  return RUTINAS.find((r) => r.id === id) ?? rutina({ id });
}

export async function crearRutina(gymId: string, datos: CreateRoutineInput): Promise<Routine> {
  const caso = casoActual();
  if (!esMio(caso)) return crearRutinaReal(gymId, datos);
  return rutina({ id: 'r9999999-9999-4999-8999-999999999999', name: datos.name });
}

export async function actualizarRutina(
  gymId: string,
  id: string,
  datos: UpdateRoutineInput,
): Promise<Routine> {
  const caso = casoActual();
  if (!esMio(caso)) return actualizarRutinaReal(gymId, id, datos);
  return rutina({ id, ...(datos.name ? { name: datos.name } : {}) });
}

export async function archivarRutina(gymId: string, id: string): Promise<Routine> {
  const caso = casoActual();
  if (!esMio(caso)) return archivarRutinaReal(gymId, id);
  // El caso que el movil NO puede predecir: el servidor dice que no porque la
  // rutina la creo otro entrenador.
  if (caso === 'entrenamiento-archivar-ajena') {
    throw new Error('Solo puede archivar esta rutina quien la creó, o el dueño del gimnasio.');
  }
  return rutina({ id, status: 'archived' });
}

export async function cargarRutinasDeSocio(
  gymId: string,
  socioId: string,
): Promise<AssignedRoutine[]> {
  const caso = casoActual();
  if (!esMio(caso)) return cargarRutinasDeSocioReal(gymId, socioId);
  return caso === 'entrenamiento-socio-sin-rutinas' ? [] : DE_SOCIO;
}

export async function asignarRutina(
  gymId: string,
  rutinaId: string,
  socioId: string,
): Promise<void> {
  const caso = casoActual();
  if (!esMio(caso)) return asignarRutinaReal(gymId, rutinaId, socioId);
}

export async function terminarAsignacion(
  gymId: string,
  rutinaId: string,
  socioId: string,
): Promise<void> {
  const caso = casoActual();
  if (!esMio(caso)) return terminarAsignacionReal(gymId, rutinaId, socioId);
}
