import { ApiError } from '@gymlab/api-client';
import { ACCOUNT_EXISTS } from '@gymlab/contracts';
import type {
  AcceptInvitationInput,
  ForgotPasswordInput,
  LinkInvitationInput,
  LinkInvitationResponse,
  ResetPasswordInput,
} from '@gymlab/contracts';
import {
  aceptarInvitacionReal,
  pedirEnlaceReal,
  restablecerClaveReal,
  vincularInvitacionReal,
} from './acceso-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DEL ACCESO. SOLO WEB, SOLO CON LA VARIABLE, SOLO ?vista=.   │
 * │                                                                          │
 * │ Existe para poder MIRAR —y comprobar automaticamente— los estados que    │
 * │ vienen DESPUES de enviar: la confirmacion prudente de «revisa tu         │
 * │ correo», el enlace caducado, y la bifurcacion del correo que ya tiene    │
 * │ cuenta. Sin esto, esos tres estados solo se pueden ver con un servidor   │
 * │ de correo delante.                                                       │
 * │                                                                          │
 * │ NO SE FALSEA NINGUNA CREDENCIAL: no hay cuentas, ni tokens, ni sesiones  │
 * │ de mentira. Lo que se simula es la RESPUESTA del servidor a una llamada  │
 * │ que no lleva datos de nadie.                                             │
 * │                                                                          │
 * │ Sin `?vista=` esto reenvia a la API tal cual. Y es `.web.ts`, asi que en │
 * │ iOS y Android Metro coge `acceso.ts`.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

function casoActual(): string | null {
  if (!HABILITADA) return null;
  return new URLSearchParams(window.location.search).get('vista');
}

/** Los casos de la vista previa empiezan todos por uno de estos. */
const MIOS = ['recuperar', 'restablecer', 'invitacion'];
const esMio = (caso: string | null) => caso !== null && MIOS.some((m) => caso.startsWith(m));

export async function pedirEnlace(input: ForgotPasswordInput): Promise<void> {
  const caso = casoActual();
  if (!esMio(caso)) return pedirEnlaceReal(input);
  if (caso === 'recuperar-error') throw new ApiError(429, 'demasiados intentos');
  // El servidor responde `ok` exista la cuenta o no. Aqui tambien.
}

export async function restablecerClave(input: ResetPasswordInput): Promise<void> {
  const caso = casoActual();
  if (!esMio(caso)) return restablecerClaveReal(input);
  if (caso === 'restablecer-caducado') throw new ApiError(400, 'token invalido o caducado');
}

export async function aceptarInvitacion(input: AcceptInvitationInput): Promise<void> {
  const caso = casoActual();
  if (!esMio(caso)) return aceptarInvitacionReal(input);
  if (caso === 'invitacion-existente') {
    // La bifurcacion: ese correo ya tiene cuenta. Con el codigo del contrato,
    // que es como lo reconoce la app.
    throw new ApiError(409, 'ese correo ya tiene cuenta', [], ACCOUNT_EXISTS);
  }
}

export async function vincularInvitacion(
  input: LinkInvitationInput,
): Promise<LinkInvitationResponse> {
  const caso = casoActual();
  if (!esMio(caso)) return vincularInvitacionReal(input);
  return { ok: true, gymId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
}
