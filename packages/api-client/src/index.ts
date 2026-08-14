/**
 * @gymlab/api-client
 *
 * El cliente HTTP de la API GYMLAB. Un modulo por dominio, y cada funcion
 * declara tres cosas: su ruta, su entrada y **el esquema de su salida**, todos
 * importados de `@gymlab/contracts`.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 *
 * ADR-0003 promete que un cambio de campo rompe la compilacion en los tres
 * extremos antes de desplegar. Eso era cierto para las *formas* y no para las
 * *llamadas*: `contracts` define los tipos, pero nada ataba una URL con su tipo
 * de respuesta. Una pantalla podia llamar a `/v1/gyms/x/members` y afirmar que
 * devuelve lo que le apeteciera; TypeScript no tenia con que desmentirlo.
 *
 * Este paquete es esa atadura, y ademas la comprueba en ejecucion: al declarar
 * el esquema de salida puede hacerle `parse()`. Sin eso, el modo de fallo
 * cuando la API renombra un campo es que la pantalla pinta `undefined` en un
 * rincon y nadie se entera. Con eso, es un error inmediato que dice que ruta y
 * que campo. Es el mismo criterio de fallar en cerrado que se aplico a RLS y al
 * consentimiento.
 *
 * ── Que NO hace ──────────────────────────────────────────────────────────
 *
 * **No valida la entrada.** El formulario ya lo hace con el mismo esquema de
 * `contracts`, y el servidor no se fia de ninguno de los dos y valida otra vez.
 * Repetirlo aqui seria una tercera copia que no protege de nada.
 *
 * **No guarda estado.** Ni sesion, ni gimnasio activo, ni cache. La sesion vive
 * en una cookie `httpOnly` que este codigo no puede leer —esa es justamente su
 * virtud—, asi que la fuente de verdad es siempre el servidor.
 *
 * ── Cobertura ────────────────────────────────────────────────────────────
 *
 * Estan los dominios que tienen pantalla. Los demas endpoints de la API se
 * anaden cuando llegue la pantalla que los usa: un metodo sin consumidor no se
 * ejecuta nunca y, por tanto, tampoco se sabe si funciona.
 */

import { createAuthApi, type AuthApi } from './auth';
import { createBillingApi, type BillingApi } from './billing';
import { createHttp, type ApiClientOptions } from './http';
import { createInvitationsApi, type InvitationsApi } from './invitations';
import { createMembersApi, type MembersApi } from './members';
import { createStaffApi, type StaffApi } from './staff';
import { createYoApi, type YoApi } from './yo';

export interface ApiClient {
  auth: AuthApi;
  members: MembersApi;
  billing: BillingApi;
  invitations: InvitationsApi;
  staff: StaffApi;
  /** Lo que cada rol pide sobre si mismo. Sin gymId en la ruta. */
  yo: YoApi;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const http = createHttp(options);
  return {
    auth: createAuthApi(http),
    members: createMembersApi(http),
    billing: createBillingApi(http),
    invitations: createInvitationsApi(http),
    staff: createStaffApi(http),
    yo: createYoApi(http),
  };
}

export type { AuthApi } from './auth';
export type { MembersApi } from './members';
export type { BillingApi } from './billing';
export type { InvitationsApi } from './invitations';
export type { StaffApi } from './staff';
export type { YoApi } from './yo';
export type { ApiClientOptions, Fetch, Http, RequestOptions } from './http';
export {
  ApiClientError,
  ApiError,
  ApiResponseError,
  NetworkError,
  type FieldIssue,
} from './errors';
