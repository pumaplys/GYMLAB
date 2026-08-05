import {
  gymStaffMemberSchema,
  okResponseSchema,
  type GymStaffMember,
  type OkResponse,
} from '@gymlab/contracts';
import { z } from 'zod';
import type { Http, RequestOptions } from './http';

/**
 * El personal del gimnasio: quien forma parte de el **ahora mismo**.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO CONFUNDIR CON `invitations`. Son dos cosas distintas:                 │
 * │                                                                          │
 * │   invitations -> promesas: pueden caducar, revocarse o no aceptarse.     │
 * │   staff       -> hechos: quien tiene acceso hoy.                        │
 * │                                                                          │
 * │ Una invitacion aceptada por alguien a quien luego se le retiro el acceso │
 * │ sigue siendo una invitacion aceptada. Deducir el presente a partir de    │
 * │ ese historial es justo lo que este endpoint evita.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface StaffApi {
  /**
   * Quien trabaja en el gimnasio. Sin socios.
   *
   * Lo ven dueno y recepcion: saber quien esta evita reinvitar a alguien que ya
   * pertenece. **Ver la lista no da poder sobre ella.**
   */
  list(gymId: string, options?: RequestOptions): Promise<GymStaffMember[]>;

  /**
   * Retira el acceso. **Solo el dueno**, y nunca a uno mismo.
   *
   * No borra: la pertenencia se termina y se conserva con su fecha, asi que
   * "quien fue recepcion entre marzo y julio" sigue siendo respondible. Y a esa
   * persona se le puede volver a contratar mas adelante.
   *
   * Surte efecto en la siguiente peticion de quien lo pierda: el servidor
   * comprueba la pertenencia vigente en cada una.
   */
  revoke(gymId: string, userId: string, options?: RequestOptions): Promise<OkResponse>;
}

export function createStaffApi(http: Http): StaffApi {
  const raiz = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}/staff`;

  return {
    list: (gymId, options) =>
      http({
        method: 'GET',
        path: raiz(gymId),
        schema: z.array(gymStaffMemberSchema),
        ...options,
      }),

    revoke: (gymId, userId, options) =>
      http({
        method: 'DELETE',
        path: `${raiz(gymId)}/${encodeURIComponent(userId)}`,
        schema: okResponseSchema,
        ...options,
      }),
  };
}
