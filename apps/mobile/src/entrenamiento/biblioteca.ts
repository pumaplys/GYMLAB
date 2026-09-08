import type { CreateExerciseInput, Exercise, MuscleGroup, Routine } from '@gymlab/contracts';

/**
 * Como se leen la biblioteca de ejercicios y la lista de rutinas en pantalla.
 *
 * Las mismas decisiones que toma el panel web en `lib/ejercicios.ts` y en sus
 * dos listas. No se copian por comodidad: si el movil dijera «full_body» donde
 * el panel dice «Cuerpo completo», seria la misma biblioteca con dos nombres.
 */

/**
 * Como se llama cada grupo muscular en pantalla.
 *
 * `Record<MuscleGroup, string>` obliga a que un grupo nuevo del contrato pase
 * por aqui: si se anadiera uno, esto deja de compilar en lugar de pintar
 * `full_body` en una lista que lee un entrenador.
 */
export const NOMBRE_DEL_GRUPO: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  legs: 'Piernas',
  shoulders: 'Hombros',
  arms: 'Brazos',
  core: 'Core',
  cardio: 'Cardio',
  full_body: 'Cuerpo completo',
};

/** El orden en que se ofrecen al crear un ejercicio. El del contrato. */
export const GRUPOS: readonly MuscleGroup[] = Object.keys(NOMBRE_DEL_GRUPO) as MuscleGroup[];

/**
 * Filtra por texto: nombre, material y grupo muscular.
 *
 * Se busca en pantalla y no en el servidor porque el endpoint devuelve la
 * biblioteca entera de una vez y no admite filtro. Son las tres formas en que
 * alguien busca un ejercicio: por como se llama, por con que se hace y por que
 * trabaja.
 */
export function filtrarEjercicios(ejercicios: readonly Exercise[], busqueda: string): Exercise[] {
  const q = busqueda.trim().toLowerCase();
  if (!q) return [...ejercicios];
  return ejercicios.filter((e) =>
    `${e.name} ${e.equipment ?? ''} ${NOMBRE_DEL_GRUPO[e.muscleGroup]}`.toLowerCase().includes(q),
  );
}

/** La segunda linea de un ejercicio: que trabaja y con que. */
export function lineaDeEjercicio(ejercicio: Exercise): string {
  const grupo = NOMBRE_DEL_GRUPO[ejercicio.muscleGroup];
  const material = ejercicio.equipment?.trim();
  return material ? `${grupo} · ${material}` : grupo;
}

/** Lo que se manda al crear o editar un ejercicio. */
export function ejercicioAEnvio(
  nombre: string,
  grupo: MuscleGroup,
  material: string,
): CreateExerciseInput {
  return {
    name: nombre.trim(),
    muscleGroup: grupo,
    // Vacio es «no hay material», no la cadena vacia: el contrato lo declara
    // opcional y el servidor guarda `null`.
    ...(material.trim() ? { equipment: material.trim() } : {}),
  };
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS ARCHIVADAS SE QUEDAN EN LA LISTA, ABAJO. NO SE ESCONDEN.            │
 * │                                                                          │
 * │ Es lo que hace el panel web, y por una razon: una rutina archivada sigue │
 * │ teniendo socios que la siguieron, y esconderla haria pensar que se       │
 * │ borro. Ademas en V1 no se desarchiva —lo dice el servicio—, asi que      │
 * │ verla es la unica forma de saber que existio.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ordenarRutinas(rutinas: readonly Routine[]): Routine[] {
  const activas = rutinas.filter((r) => r.status === 'active');
  const archivadas = rutinas.filter((r) => r.status !== 'active');
  const porNombre = (a: Routine, b: Routine) => a.name.localeCompare(b.name, 'es');
  return [...activas.sort(porNombre), ...archivadas.sort(porNombre)];
}

/** La segunda linea de una rutina: cuanto tiene y a cuantos les toca. */
export function lineaDeRutina(rutina: Routine): string {
  const ejercicios = rutina.items.length === 1 ? '1 ejercicio' : `${rutina.items.length} ejercicios`;
  if (rutina.status !== 'active') return `${ejercicios} · archivada`;
  const n = rutina.activeAssignments;
  if (n === 0) return `${ejercicios} · sin asignar`;
  return `${ejercicios} · ${n === 1 ? '1 socio' : `${n} socios`}`;
}

/**
 * Que rutinas se pueden ofrecer para asignar a un socio.
 *
 * Dos motivos para dejar una fuera, y los dos los impone el servidor:
 * archivada —«no admite asignaciones nuevas»— y ya asignada —«Ese socio ya
 * sigue esa rutina»—. Se filtran aqui para no ofrecer lo que va a dar error,
 * no para decidir en su lugar.
 */
export function asignables(
  rutinas: readonly Routine[],
  yaAsignadas: readonly { id: string }[],
): Routine[] {
  const suyas = new Set(yaAsignadas.map((r) => r.id));
  return ordenarRutinas(rutinas.filter((r) => r.status === 'active' && !suyas.has(r.id)));
}
