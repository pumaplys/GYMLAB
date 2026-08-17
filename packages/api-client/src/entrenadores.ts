import { z } from 'zod';
import {
  memberTrainerSchema,
  trainerSchema,
  type MemberTrainer,
  type Trainer,
} from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * Quien entrena a quien. Lo gestiona el personal, no el entrenador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ASIGNAR UN SOCIO A UN ENTRENADOR NO ES ASIGNARLE UNA RUTINA.             │
 * │                                                                          │
 * │ Son dos capacidades distintas y las hace gente distinta: aqui el dueno o │
 * │ recepcion deciden QUIEN lleva a esa persona; la rutina la decide despues │
 * │ el propio entrenador, desde su area.                                     │
 * │                                                                          │
 * │ Confundirlas costo caro: el area de entrenador se construyo entera antes │
 * │ de notar que nadie podia llenar su cartera desde el producto — las       │
 * │ pruebas la llenaban por API.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * VARIOS ENTRENADORES A LA VEZ es lo normal y esta en el modelo: fuerza con uno
 * y rehabilitacion con otro. No hay "entrenador principal".
 */
export interface EntrenadoresApi {
  /** Los entrenadores del gimnasio, para poder elegir. */
  lista(gymId: string, options?: RequestOptions): Promise<Trainer[]>;

  /**
   * Quien entrena a este socio AHORA MISMO.
   *
   * Solo las asignaciones vigentes: terminar una le pone `ended_at` y la fila se
   * queda como historial, pero esto pregunta por el estado de hoy.
   */
  deSocio(gymId: string, memberId: string, options?: RequestOptions): Promise<MemberTrainer[]>;

  /**
   * Asigna este socio a ese entrenador.
   *
   * Se ACUMULA: no termina ninguna asignacion anterior. Asignar dos veces la
   * misma pareja mientras siga vigente responde 400.
   */
  asignar(
    gymId: string,
    trainerId: string,
    memberId: string,
    options?: RequestOptions,
  ): Promise<unknown>;

  /**
   * Termina UNA asignacion concreta. No borra la fila: le pone `ended_at`.
   *
   * Es lo que permite volver a asignar la misma pareja mas adelante, y lo que
   * hace que las rutinas que asigno ese entrenador sigan teniendo explicacion.
   */
  retirar(
    gymId: string,
    trainerId: string,
    memberId: string,
    options?: RequestOptions,
  ): Promise<unknown>;
}

export function createEntrenadoresApi(http: Http): EntrenadoresApi {
  const raiz = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}/trainers`;

  return {
    lista: (gymId, options) =>
      http({ method: 'GET', path: raiz(gymId), schema: z.array(trainerSchema), ...options }),

    deSocio: (gymId, memberId, options) =>
      http({
        method: 'GET',
        path: `/gyms/${encodeURIComponent(gymId)}/members/${encodeURIComponent(memberId)}/trainers`,
        schema: z.array(memberTrainerSchema),
        ...options,
      }),

    asignar: (gymId, trainerId, memberId, options) =>
      http({
        method: 'POST',
        path: `${raiz(gymId)}/${encodeURIComponent(trainerId)}/members`,
        body: { memberId },
        schema: z.unknown(),
        ...options,
      }),

    retirar: (gymId, trainerId, memberId, options) =>
      http({
        method: 'DELETE',
        path: `${raiz(gymId)}/${encodeURIComponent(trainerId)}/members/${encodeURIComponent(memberId)}`,
        schema: z.unknown(),
        ...options,
      }),
  };
}
