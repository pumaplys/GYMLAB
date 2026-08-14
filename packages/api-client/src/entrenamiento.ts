import { z } from 'zod';
import { exerciseSchema, routineSchema, type Exercise, type Routine } from '@gymlab/contracts';
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
  };
}
