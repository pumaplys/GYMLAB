import { z } from 'zod';
import {
  assignedRoutineSchema,
  exerciseSchema,
  routineSchema,
  type AssignedRoutine,
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
 * Falta `borrar rutina`: existe en la API pero todavia no hay pantalla que lo
 * use, y un metodo sin consumidor no se ejecuta nunca — asi que tampoco se sabe
 * si funciona.
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

  /**
   * Las rutinas que un socio sigue AHORA MISMO.
   *
   * Solo las vigentes: el servidor filtra por `ended_at IS NULL`. Las terminadas
   * siguen en la base —una asignacion se termina, no se borra— pero no hay
   * endpoint que las devuelva, asi que no hay historial que pintar.
   *
   * Cada una viene con la rutina ENTERA, ejercicios incluidos, mas
   * `assignmentId` y `assignedAt`.
   *
   * Si quien pregunta es entrenador, responde 404 cuando ese socio no esta entre
   * los suyos — igual que si no existiera.
   */
  rutinasDeSocio(
    gymId: string,
    memberId: string,
    options?: RequestOptions,
  ): Promise<AssignedRoutine[]>;

  /**
   * Asigna una rutina a un socio.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ ASIGNAR NO REEMPLAZA NADA. SE ACUMULAN.                                  │
   * │                                                                          │
   * │ Un socio puede seguir varias rutinas a la vez —fuerza y movilidad— y esa │
   * │ es una decision del modelo, no un descuido. Asignar una segunda deja la  │
   * │ primera vigente; para quitarla hay que terminarla expresamente.          │
   * │                                                                          │
   * │ Lo unico que NO se puede es asignar dos veces la MISMA rutina mientras   │
   * │ siga vigente: responde 400 "Ese socio ya sigue esa rutina."              │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * La ruta cuelga de la rutina y no del socio, pero eso es forma de la API: lo
   * que decide si se puede es de quien es el socio.
   */
  asignarRutina(
    gymId: string,
    routineId: string,
    memberId: string,
    options?: RequestOptions,
  ): Promise<void>;

  /**
   * Termina la asignacion vigente. NO borra la fila: le pone `ended_at`.
   *
   * Es lo que permite saber dentro de tres meses que rutina siguio alguien. 404
   * si ese socio no sigue esa rutina.
   */
  terminarAsignacion(
    gymId: string,
    routineId: string,
    memberId: string,
    options?: RequestOptions,
  ): Promise<void>;
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

    rutinasDeSocio: (gymId, memberId, options) =>
      http({
        method: 'GET',
        path: `${raiz(gymId)}/members/${encodeURIComponent(memberId)}/routines`,
        schema: z.array(assignedRoutineSchema),
        ...options,
      }),

    asignarRutina: (gymId, routineId, memberId, options) =>
      http({
        method: 'POST',
        path: `${raiz(gymId)}/routines/${encodeURIComponent(routineId)}/members`,
        body: { memberId },
        // Responde `{ ok: true }`. No devuelve la asignacion, asi que quien
        // llame tiene que volver a pedir la lista para verla.
        schema: z.object({ ok: z.literal(true) }).transform(() => undefined),
        ...options,
      }),

    terminarAsignacion: (gymId, routineId, memberId, options) =>
      http({
        method: 'DELETE',
        path: `${raiz(gymId)}/routines/${encodeURIComponent(routineId)}/members/${encodeURIComponent(memberId)}`,
        schema: z.object({ ok: z.literal(true) }).transform(() => undefined),
        ...options,
      }),
  };
}
