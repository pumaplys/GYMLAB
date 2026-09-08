import type {
  AssignedRoutine,
  CreateExerciseInput,
  CreateRoutineInput,
  Exercise,
  Routine,
  UpdateExerciseInput,
  UpdateRoutineInput,
} from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * Las llamadas de entrenamiento, envueltas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ENVOLTORIOS Y NO `api.entrenamiento.*` SUELTO EN LAS PANTALLAS.         │
 * │                                                                          │
 * │ Es lo que permite que la vista previa web sustituya la fuente sin tocar  │
 * │ una sola pantalla — y lo que hace que ningun dato de muestra viaje al    │
 * │ binario, porque Metro coge `fuente.ts` en iOS y Android.                 │
 * │                                                                          │
 * │ Aqui no hay ninguna regla de negocio. El `gymId` se pasa desde la        │
 * │ sesion, que es de donde sale en todas las demas pantallas del personal.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export function cargarEjerciciosReal(gymId: string): Promise<Exercise[]> {
  return api.entrenamiento.ejercicios(gymId);
}

export function crearEjercicioReal(gymId: string, datos: CreateExerciseInput): Promise<Exercise> {
  return api.entrenamiento.crearEjercicio(gymId, datos);
}

export function actualizarEjercicioReal(
  gymId: string,
  id: string,
  datos: UpdateExerciseInput,
): Promise<Exercise> {
  return api.entrenamiento.actualizarEjercicio(gymId, id, datos);
}

export function eliminarEjercicioReal(gymId: string, id: string): Promise<void> {
  return api.entrenamiento.eliminarEjercicio(gymId, id);
}

export function cargarRutinasReal(gymId: string): Promise<Routine[]> {
  return api.entrenamiento.rutinas(gymId);
}

export function cargarRutinaReal(gymId: string, id: string): Promise<Routine> {
  return api.entrenamiento.rutina(gymId, id);
}

export function crearRutinaReal(gymId: string, datos: CreateRoutineInput): Promise<Routine> {
  return api.entrenamiento.crearRutina(gymId, datos);
}

export function actualizarRutinaReal(
  gymId: string,
  id: string,
  datos: UpdateRoutineInput,
): Promise<Routine> {
  return api.entrenamiento.actualizarRutina(gymId, id, datos);
}

export function archivarRutinaReal(gymId: string, id: string): Promise<Routine> {
  return api.entrenamiento.archivarRutina(gymId, id);
}

export function cargarRutinasDeSocioReal(
  gymId: string,
  socioId: string,
): Promise<AssignedRoutine[]> {
  return api.entrenamiento.rutinasDeSocio(gymId, socioId);
}

export function asignarRutinaReal(
  gymId: string,
  rutinaId: string,
  socioId: string,
): Promise<void> {
  return api.entrenamiento.asignarRutina(gymId, rutinaId, socioId);
}

export function terminarAsignacionReal(
  gymId: string,
  rutinaId: string,
  socioId: string,
): Promise<void> {
  return api.entrenamiento.terminarAsignacion(gymId, rutinaId, socioId);
}
