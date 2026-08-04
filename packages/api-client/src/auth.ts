import {
  meSchema,
  okResponseSchema,
  sessionResponseSchema,
  type LoginInput,
  type Me,
  type OkResponse,
  type SessionResponse,
  type SwitchGymInput,
} from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * Autenticacion y sesion.
 *
 * La cookie no aparece por ningun lado, y es lo correcto: es `httpOnly`, la
 * emite el servidor y la envia el navegador. Este modulo no la crea, no la lee
 * y no la borra — `logout` le pide al servidor que la invalide y el servidor
 * responde con la cookie de borrado.
 *
 * Corolario que conviene tener presente al escribir pantallas: **no hay forma
 * de preguntarle al cliente "¿hay sesion?" sin ir al servidor.** Se pregunta con
 * `me()`, y un 401 es la respuesta de que no.
 */
export interface AuthApi {
  login(input: LoginInput, options?: RequestOptions): Promise<SessionResponse>;
  logout(options?: RequestOptions): Promise<OkResponse>;
  /** Quien eres, en que gimnasio estas y a cuales perteneces. */
  me(options?: RequestOptions): Promise<Me>;
  /**
   * Cambia el gimnasio activo de la sesion.
   *
   * Hace falta siempre que `activeGymId` venga a null: el login solo lo fija
   * cuando la persona pertenece a un unico gimnasio, porque con varios adivinar
   * cual quiere seria peor que preguntar.
   */
  switchGym(input: SwitchGymInput, options?: RequestOptions): Promise<SessionResponse>;
}

export function createAuthApi(http: Http): AuthApi {
  return {
    login: (input, options) =>
      http({
        method: 'POST',
        path: '/auth/login',
        body: input,
        schema: sessionResponseSchema,
        ...options,
      }),

    logout: (options) =>
      http({ method: 'POST', path: '/auth/logout', schema: okResponseSchema, ...options }),

    me: (options) => http({ method: 'GET', path: '/auth/me', schema: meSchema, ...options }),

    switchGym: (input, options) =>
      http({
        method: 'POST',
        path: '/auth/switch-gym',
        body: input,
        schema: sessionResponseSchema,
        ...options,
      }),
  };
}
