import type { Exercise, MuscleGroup } from '@gymlab/contracts';

/**
 * Como se lee la biblioteca de ejercicios en pantalla.
 *
 * Esta aqui y no en una de las dos pantallas que la usan porque la biblioteca se
 * mira en dos sitios —la lista completa y el selector del editor de rutinas— y
 * las dos tienen que decir "Cuerpo completo" y buscar por lo mismo. Con una
 * copia en cada una, se separan a la primera correccion.
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
