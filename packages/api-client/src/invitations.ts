import {
  invitationSchema,
  okResponseSchema,
  type CreateInvitationInput,
  type Invitation,
  type OkResponse,
} from '@gymlab/contracts';
import { z } from 'zod';
import type { Http, RequestOptions } from './http';

/**
 * Invitaciones al gimnasio.
 *
 * Es como entra TODO el mundo: no hay auto-registro (ADR-0007). El personal se
 * invita desde aqui; a los socios se les invita desde su ficha, que ademas
 * vincula la invitacion con ella.
 *
 * Quien puede invitar a quien lo decide `CAN_INVITE`, que vive en
 * `@gymlab/contracts` para que el desplegable de roles se pinte con **las
 * mismas reglas** que el servidor va a aplicar. El servidor no se fia igual.
 */
export interface InvitationsApi {
  /**
   * Todas las invitaciones del gimnasio: pendientes, aceptadas y revocadas.
   *
   * Incluye las de socios, porque comparten tabla y ciclo de vida. Filtrar por
   * rol es cosa de quien pinte la pantalla.
   */
  list(gymId: string, options?: RequestOptions): Promise<Invitation[]>;

  create(
    gymId: string,
    input: CreateInvitationInput,
    options?: RequestOptions,
  ): Promise<Invitation>;

  /**
   * Revoca una invitacion **pendiente**.
   *
   * Una ya aceptada no se revoca —la persona ya esta dentro, y para eso hay que
   * retirarle la pertenencia— y una ya revocada tampoco: las dos dan 404 en vez
   * de un exito silencioso.
   */
  revoke(gymId: string, invitationId: string, options?: RequestOptions): Promise<OkResponse>;
}

export function createInvitationsApi(http: Http): InvitationsApi {
  const raiz = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}/invitations`;

  return {
    list: (gymId, options) =>
      http({ method: 'GET', path: raiz(gymId), schema: z.array(invitationSchema), ...options }),

    create: (gymId, input, options) =>
      http({
        method: 'POST',
        path: raiz(gymId),
        body: input,
        schema: invitationSchema,
        ...options,
      }),

    revoke: (gymId, invitationId, options) =>
      http({
        method: 'DELETE',
        path: `${raiz(gymId)}/${encodeURIComponent(invitationId)}`,
        schema: okResponseSchema,
        ...options,
      }),
  };
}
