import {
  emailFlowResponseSchema,
  linkInvitationResponseSchema,
  meSchema,
  okResponseSchema,
  sessionResponseSchema,
  type AcceptInvitationInput,
  type EmailFlowResponse,
  type ForgotPasswordInput,
  type LinkInvitationInput,
  type LinkInvitationResponse,
  type LoginInput,
  type Me,
  type OkResponse,
  type ResetPasswordInput,
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

  /**
   * Acepta una invitacion creando una cuenta NUEVA, y deja la sesion abierta.
   *
   * SOLO para cuentas nuevas (ADR-0010). Si ese correo ya tiene cuenta, la API
   * responde 409 con `code: ACCOUNT_EXISTS` y no toca nada; ese camino es
   * `linkInvitation`, autenticado.
   *
   * El 409 se distingue por el codigo, no por el estado ni por el texto: la
   * constante la exporta `@gymlab/contracts` y la comparan los dos lados.
   */
  acceptInvitation(
    input: AcceptInvitationInput,
    options?: RequestOptions,
  ): Promise<SessionResponse>;

  /**
   * Vincula una invitacion a la cuenta con la que ya estas dentro.
   *
   * Exige sesion, y el contrato **no lleva contrasena**: por construccion, este
   * camino no puede modificar credenciales. Esa es la garantia de ADR-0010.
   *
   * No cambia el gimnasio activo. Devuelve el gimnasio al que se acaba de
   * entrar para que el cliente pueda ofrecer el cambio con `switchGym`.
   */
  linkInvitation(
    input: LinkInvitationInput,
    options?: RequestOptions,
  ): Promise<LinkInvitationResponse>;

  /**
   * Pide el correo con el enlace para poner una contrasena nueva.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ RESPONDE `ok` EXISTA LA CUENTA O NO, Y ESO NO ES UN DESCUIDO.        │
   * │                                                                      │
   * │ Distinguir los dos casos convertiria este endpoint en un comprobador │
   * │ de quien esta dado de alta en la plataforma: se prueban correos uno  │
   * │ a uno y el que responda distinto delata a un cliente.                │
   * │                                                                      │
   * │ Consecuencia para quien escriba la pantalla: **no se puede decir "te │
   * │ hemos enviado un correo"**, porque puede que no se haya enviado      │
   * │ ninguno. El texto tiene que ser condicional.                          │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  forgotPassword(
    input: ForgotPasswordInput,
    options?: RequestOptions,
  ): Promise<EmailFlowResponse>;

  /**
   * Fija la contrasena nueva con el token que llego en el correo.
   *
   * No abre sesion: la respuesta no trae token de sesion, asi que despues hay
   * que entrar por el camino de siempre. Es deliberado — quien restablece
   * puede no ser quien pidio el enlace.
   *
   * Un token gastado, caducado o inventado son el mismo 400 con el mismo
   * texto. Igual que arriba: separarlos diria si el enlace existio.
   */
  resetPassword(input: ResetPasswordInput, options?: RequestOptions): Promise<OkResponse>;
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

    acceptInvitation: (input, options) =>
      http({
        method: 'POST',
        path: '/auth/accept-invitation',
        body: input,
        schema: sessionResponseSchema,
        ...options,
      }),

    linkInvitation: (input, options) =>
      http({
        method: 'POST',
        path: '/auth/link-invitation',
        body: input,
        schema: linkInvitationResponseSchema,
        ...options,
      }),

    forgotPassword: (input, options) =>
      http({
        method: 'POST',
        path: '/auth/forgot-password',
        body: input,
        schema: emailFlowResponseSchema,
        ...options,
      }),

    resetPassword: (input, options) =>
      http({
        method: 'POST',
        path: '/auth/reset-password',
        body: input,
        schema: okResponseSchema,
        ...options,
      }),
  };
}
