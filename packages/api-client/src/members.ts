import {
  memberListSchema,
  memberSchema,
  type CreateMemberInput,
  type ListMembersQuery,
  type Member,
  type MemberList,
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
}

export function createMembersApi(http: Http): MembersApi {
  const raiz = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}/members`;

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
  };
}
