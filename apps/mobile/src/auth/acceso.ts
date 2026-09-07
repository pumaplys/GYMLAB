/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION NATIVA: NO HAY VISTA PREVIA. SON LAS LLAMADAS DE VERDAD.     │
 * │                                                                          │
 * │ Metro elige `acceso.web.ts` al compilar para web y ESTE fichero para iOS │
 * │ y Android. Ninguna respuesta de muestra se empaqueta en el binario.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export {
  pedirEnlaceReal as pedirEnlace,
  restablecerClaveReal as restablecerClave,
  aceptarInvitacionReal as aceptarInvitacion,
  vincularInvitacionReal as vincularInvitacion,
} from './acceso-real';
