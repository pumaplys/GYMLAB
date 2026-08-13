import { z } from 'zod';
import {
  invitationSchema,
  memberListSchema,
  memberSchema,
  type CreateMemberInput,
  type Invitation,
  type ListMembersQuery,
  type Member,
  type MemberList,
  type UpdateMemberInput,
} from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * Socios.
 *
 * El `gymId` viaja en la ruta porque asi es la API, pero **no es quien decide el
 * aislamiento**: el servidor lo compara con el gimnasio activo de la sesion y
 * responde 403 si no coinciden. Escribir aqui el id de otro gimnasio no abre
 * nada; solo produce un error.
 *
 * Sale de `auth.me().activeGymId`, nunca de la URL del navegador.
 */
export interface MembersApi {
  /** Listado paginado. La busqueda `q` cubre nombre, apellido, email y numero. */
  list(gymId: string, query: ListMembersQuery, options?: RequestOptions): Promise<MemberList>;
  /**
   * Alta de socio.
   *
   * Dar de alta e invitar a crear cuenta son dos acciones distintas: un gimnasio
   * tiene socios que nunca tendran cuenta, y la ficha existe sin ella.
   */
  create(gymId: string, input: CreateMemberInput, options?: RequestOptions): Promise<Member>;

  /** Una ficha. 404 si no existe en ESE gimnasio. */
  getById(gymId: string, id: string, options?: RequestOptions): Promise<Member>;

  /**
   * Edicion parcial: solo viajan los campos que se mandan.
   *
   * LIMITACION DEL CONTRATO, no de este cliente: los campos opcionales no son
   * anulables, asi que se puede cambiar un telefono pero **no vaciarlo**. Omitir
   * un campo significa "no lo toques", no "borralo".
   */
  update(
    gymId: string,
    id: string,
    input: UpdateMemberInput,
    options?: RequestOptions,
  ): Promise<Member>;

  /** Baja. Devuelve la ficha ya actualizada; 400 si ya estaba de baja. */
  deactivate(gymId: string, id: string, options?: RequestOptions): Promise<Member>;

  /** Vuelta al alta. 400 si ya estaba activa o si su email lo ocupa otra ficha. */
  reactivate(gymId: string, id: string, options?: RequestOptions): Promise<Member>;

  /**
   * Invita al socio a crear su cuenta.
   *
   * Devuelve la invitacion, no una sesion: quien la acepta es el socio, desde el
   * enlace que le llega por correo. 400 si la ficha no tiene email, si ya tiene
   * cuenta o si esta de baja.
   */
  invite(gymId: string, id: string, options?: RequestOptions): Promise<Invitation>;

  /**
   * Todo lo que el gimnasio guarda de esa persona (RGPD art. 15 y 20).
   *
   * Sin esquema a proposito, y es la unica excepcion del cliente. El resto de
   * metodos validan la respuesta contra el contrato porque su forma es fija;
   * esta la componen los modulos que haya registrados en cada momento, asi que
   * un esquema cerrado dejaria fuera al siguiente que se anada — y en una
   * entrega legal, de silencio ya hubo bastante.
   *
   * Solo el dueno. Recepcion recibe 403.
   */
  exportData(gymId: string, id: string, options?: RequestOptions): Promise<unknown>;

  /**
   * Borrado por derecho al olvido (art. 17). NO es dar de baja.
   *
   * Dar de baja conserva la ficha —el gimnasio necesita historial— y esto la
   * elimina junto con sus notas, su progreso, sus consentimientos y sus cuotas.
   * Los pagos y los accesos se conservan sin socio: la obligacion contable
   * convive con el derecho al olvido, y el art. 17.3.b lo permite.
   *
   * Solo el dueno.
   */
  erase(gymId: string, id: string, options?: RequestOptions): Promise<{ ok: true }>;
}

export function createMembersApi(http: Http): MembersApi {
  const raiz = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}/members`;
  const ficha = (gymId: string, id: string) => `${raiz(gymId)}/${encodeURIComponent(id)}`;

  return {
    list: (gymId, query, options) =>
      http({
        method: 'GET',
        path: raiz(gymId),
        query,
        schema: memberListSchema,
        ...options,
      }),

    create: (gymId, input, options) =>
      http({
        method: 'POST',
        path: raiz(gymId),
        body: input,
        schema: memberSchema,
        ...options,
      }),

    getById: (gymId, id, options) =>
      http({ method: 'GET', path: ficha(gymId, id), schema: memberSchema, ...options }),

    update: (gymId, id, input, options) =>
      http({
        method: 'PATCH',
        path: ficha(gymId, id),
        body: input,
        schema: memberSchema,
        ...options,
      }),

    deactivate: (gymId, id, options) =>
      http({
        method: 'POST',
        path: `${ficha(gymId, id)}/deactivate`,
        schema: memberSchema,
        ...options,
      }),

    reactivate: (gymId, id, options) =>
      http({
        method: 'POST',
        path: `${ficha(gymId, id)}/reactivate`,
        schema: memberSchema,
        ...options,
      }),

    invite: (gymId, id, options) =>
      http({
        method: 'POST',
        path: `${ficha(gymId, id)}/invite`,
        schema: invitationSchema,
        ...options,
      }),

    exportData: (gymId, id, options) =>
      http({
        method: 'GET',
        path: `${ficha(gymId, id)}/export`,
        schema: z.unknown(),
        ...options,
      }),

    erase: (gymId, id, options) =>
      http({
        method: 'DELETE',
        path: ficha(gymId, id),
        schema: z.object({ ok: z.literal(true) }),
        ...options,
      }),
  };
}
