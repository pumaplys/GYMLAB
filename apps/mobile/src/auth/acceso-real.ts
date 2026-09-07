import type {
  AcceptInvitationInput,
  ForgotPasswordInput,
  LinkInvitationInput,
  LinkInvitationResponse,
  ResetPasswordInput,
} from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * Las cuatro llamadas de PARITY-0. Ninguna necesita sesion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS CUATRO ENDPOINTS YA EXISTIAN Y NINGUNO LLEVA `@Roles`.              │
 * │                                                                          │
 * │   POST /auth/forgot-password     pedir el enlace                         │
 * │   POST /auth/reset-password      elegir contraseña nueva                 │
 * │   POST /auth/accept-invitation   crear la cuenta con el token            │
 * │   POST /auth/link-invitation     añadir el gimnasio a una cuenta ya viva │
 * │                                                                          │
 * │ No llevan rol porque quien los usa todavia no tiene ninguno. Lo que los  │
 * │ protege es el TOKEN: de un solo uso, con caducidad, y emitido por el     │
 * │ servidor. Es el mismo juego que ya usa el panel web.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function pedirEnlaceReal(input: ForgotPasswordInput): Promise<void> {
  await api.auth.forgotPassword(input);
}

export async function restablecerClaveReal(input: ResetPasswordInput): Promise<void> {
  await api.auth.resetPassword(input);
}

export async function aceptarInvitacionReal(input: AcceptInvitationInput): Promise<void> {
  await api.auth.acceptInvitation(input);
}

export async function vincularInvitacionReal(
  input: LinkInvitationInput,
): Promise<LinkInvitationResponse> {
  return api.auth.linkInvitation(input);
}
