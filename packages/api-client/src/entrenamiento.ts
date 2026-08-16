import { z } from 'zod';
import {
  exerciseSchema,
  routineSchema,
  type CreateRoutineInput,
  type Exercise,
  type Routine,
  type UpdateRoutineInput,
} from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * Ejercicios y rutinas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTAS RUTAS SI LLEVAN `gymId`, Y NO ES UNA INCOHERENCIA.                 │
 * │                                                                          │
 * │ Las del entrenador sobre si mismo —`/me/trainer/...`— no lo llevan       │
 * │ porque el servidor resuelve la ficha por la sesion. Estas son otra cosa: │
 * │ la biblioteca y las rutinas son del GIMNASIO, no de quien las mira, y su │
 * │ ruta lo dice.                                                            │
 * │                                                                          │
 * │ El `gymId` tampoco decide aqui el aislamiento: el servidor lo compara    │
 * │ con el gimnasio activo de la sesion y responde 403 si no coinciden.      │
 * │ Escribir el de otro gimnasio no abre nada, solo produce un error.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * SOLO LECTURA DE MOMENTO. Crear, editar, borrar y asignar existen en la API y
 * se anadiran con la pantalla que los use: un metodo sin consumidor no se
 * ejecuta nunca y, por tanto, tampoco se sabe si funciona.
 */
export interface EntrenamientoApi {
  /**
   * La biblioteca del gimnasio, ordenada por grupo muscular y nombre.
   *
   * Es SUYA (ADR-0012): nace copiada de la plantilla de plataforma y a partir
   * de ahi el gimnasio la edita. No hay ejercicios globales compartidos — cada
   * fila pertenece a un gimnasio, y `fromTemplate` solo dice de donde vino.
   */
  ejercicios(gymId: string, options?: RequestOptions): Promise<Exercise[]>;

  /**
   * Las rutinas del gimnasio, con sus ejercicios ya dentro.
   *
   * TODAS las del gimnasio, no solo las que creo quien pregunta: el servicio no
   * filtra por autor. `created_by_user_id` existe, pero solo decide quien puede
   * BORRAR una rutina — cualquier entrenador del gimnasio puede consultarlas,
   * porque un socio puede estar siguiendo la de un companero.
   */
  rutinas(gymId: string, options?: RequestOptions): Promise<Routine[]>;

  /** Una rutina. 404 si no es de ese gimnasio. */
  rutina(gymId: string, id: string, options?: RequestOptions): Promise<Routine>;

  /** Crea una rutina. Exige al menos un ejercicio; el orden de la lista ES el orden. */
  crearRutina(gymId: string, input: CreateRoutineInput, options?: RequestOptions): Promise<Routine>;

  /**
   * Edita una rutina. La puede editar CUALQUIER entrenador del gimnasio.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ SI SE MANDA `items`, REEMPLAZA LA LISTA ENTERA.                          │
   * │                                                                          │
   * │ El servidor borra los items y los reinserta desde lo que llegue, asi que │
   * │ omitir uno es borrarlo. No hay reconciliacion parcial que valga: quien   │
   * │ llame tiene que mandar la coleccion completa y en su orden final.        │
   * │                                                                          │
   * │ Y al reves: `items` es OPCIONAL. Mandar solo `name` o `description` deja │
   * │ los ejercicios intactos — que es la unica forma de editar el titulo de   │
   * │ una rutina que contenga un ejercicio ya borrado de la biblioteca sin     │
   * │ perderlo.                                                                │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  actualizarRutina(
    gymId: string,
    id: string,
    input: UpdateRoutineInput,
    options?: RequestOptions,
  ): Promise<Routine>;
}

export function createEntrenamientoApi(http: Http): EntrenamientoApi {
  const raiz = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}`;

  return {
    ejercicios: (gymId, options) =>
      http({
        method: 'GET',
        path: `${raiz(gymId)}/exercises`,
        schema: z.array(exerciseSchema),
        ...options,
      }),

    rutinas: (gymId, options) =>
      http({
        method: 'GET',
        path: `${raiz(gymId)}/routines`,
        schema: z.array(routineSchema),
        ...options,
      }),

    rutina: (gymId, id, options) =>
      http({
        method: 'GET',
        path: `${raiz(gymId)}/routines/${encodeURIComponent(id)}`,
        schema: routineSchema,
        ...options,
      }),

    crearRutina: (gymId, input, options) =>
      http({
        method: 'POST',
        path: `${raiz(gymId)}/routines`,
        body: input,
        schema: routineSchema,
        ...options,
      }),

    actualizarRutina: (gymId, id, input, options) =>
      http({
        method: 'PATCH',
        path: `${raiz(gymId)}/routines/${encodeURIComponent(id)}`,
        body: input,
        schema: routineSchema,
        ...options,
      }),
  };
}
