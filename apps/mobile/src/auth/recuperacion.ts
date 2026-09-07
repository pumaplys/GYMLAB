import { ApiError, ApiResponseError, NetworkError } from '@gymlab/api-client';
import { ACCOUNT_EXISTS } from '@gymlab/contracts';

/**
 * Volver a entrar: las decisiones, sin React y sin red.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES LA UNICA VIA DE VUELTA AL SISTEMA.                                   │
 * │                                                                          │
 * │ Nadie puede reponerle la contraseña a nadie —ni el dueño del gimnasio—,  │
 * │ asi que si esto no esta en el telefono, quien la olvida tiene que ir al  │
 * │ navegador. Ese era el hueco entero del socio en la auditoria de paridad. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * ¿Hay token utilizable en este enlace?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN TOKEN EN BLANCO NO ES LO MISMO QUE UNO AUSENTE, Y AQUI SE IGUALAN.   │
 * │                                                                          │
 * │ `?token=%20` sale de un enlace que se rompio al copiarlo a mano. En el   │
 * │ panel web ese caso fallaba MUDO: el esquema se quejaba de un campo que   │
 * │ la pantalla no pinta, el aviso se guardaba donde nadie lo ve y el boton  │
 * │ dejaba de responder sin decir por que. Esta comprobado alli y se hace    │
 * │ aqui desde el principio.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function tokenDelEnlace(crudo: string | string[] | undefined): string | null {
  // `useLocalSearchParams` devuelve un array si el parametro viene repetido.
  const valor = Array.isArray(crudo) ? crudo[0] : crudo;
  const limpio = valor?.trim() ?? '';
  return limpio.length > 0 ? limpio : null;
}

/**
 * Que decir cuando falla pedir el enlace de recuperacion.
 *
 * El servidor responde `ok` exista la cuenta o no —a proposito, para que el
 * formulario no sea un comprobador de quien esta dado de alta— asi que aqui
 * solo quedan fallos de transporte y de formato.
 */
export function mensajeDeRecuperacion(problema: unknown): string {
  if (problema instanceof ApiError) {
    if (problema.status === 400) return 'Ese correo no tiene un formato válido.';
    if (problema.status === 429) {
      return 'Demasiados intentos seguidos. Espera un momento antes de volver a probar.';
    }
    return 'El servicio no está disponible ahora mismo. Inténtalo de nuevo.';
  }
  if (problema instanceof NetworkError) {
    return 'No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo.';
  }
  if (problema instanceof ApiResponseError) {
    return 'El servicio ha respondido algo que no esperábamos. Inténtalo de nuevo.';
  }
  return 'Algo ha ido mal. Inténtalo de nuevo.';
}

/**
 * Que decir cuando falla restablecer la contraseña.
 *
 * Un token gastado, uno caducado y uno inventado son el MISMO 400 con el mismo
 * texto, y esta bien que lo sean: distinguirlos le diria a quien prueba tokens
 * cual de ellos existio alguna vez.
 */
export function mensajeDeRestablecer(problema: unknown): string {
  if (problema instanceof ApiError) {
    if (problema.status === 400) {
      return 'Ese enlace ya no sirve: puede que se haya usado o que haya caducado. Pide uno nuevo.';
    }
    if (problema.status === 429) {
      return 'Demasiados intentos seguidos. Espera un momento antes de volver a probar.';
    }
    return 'El servicio no está disponible ahora mismo. Inténtalo de nuevo.';
  }
  if (problema instanceof NetworkError) {
    return 'No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo.';
  }
  return 'Algo ha ido mal. Inténtalo de nuevo.';
}

/**
 * Que decir cuando falla aceptar una invitacion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL 409 NO ES UN ERROR: ES UNA BIFURCACION.                              │
 * │                                                                          │
 * │ Significa que ese correo YA tiene cuenta, asi que no hay que crearla      │
 * │ sino entrar y vincular la invitacion (ADR-0010). Quien llama a esto      │
 * │ debe mirar `esCuentaExistente` ANTES de enseñar ningun mensaje.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function esCuentaExistente(problema: unknown): boolean {
  /*
   * Se reconoce por el CODIGO DEL CONTRATO, no por el 409 ni por el texto.
   * Es lo mismo que hace el panel web, y por el mismo motivo: el 409 es un
   * codigo de transporte que otro caso podria acabar usando, y el texto es
   * copy que puede cambiar sin avisar. `ACCOUNT_EXISTS` esta declarado en
   * `@gymlab/contracts` justo para esto.
   */
  return problema instanceof ApiError && problema.code === ACCOUNT_EXISTS;
}

export function mensajeDeInvitacion(problema: unknown): string {
  if (problema instanceof ApiError) {
    if (problema.status === 400 || problema.status === 404) {
      return 'Esa invitación ya no sirve: puede que se haya usado, que haya caducado o que la hayan retirado.';
    }
    if (problema.status === 429) {
      return 'Demasiados intentos seguidos. Espera un momento antes de volver a probar.';
    }
    return 'El servicio no está disponible ahora mismo. Inténtalo de nuevo.';
  }
  if (problema instanceof NetworkError) {
    return 'No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo.';
  }
  return 'Algo ha ido mal. Inténtalo de nuevo.';
}

/**
 * Los tres caminos de una invitacion, decididos por el estado de la sesion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUIEN ABRE EL ENLACE PUEDE ESTAR EN TRES SITIOS DISTINTOS.              │
 * │                                                                          │
 * │   sin sesion + cuenta nueva      -> crear la cuenta con el token         │
 * │   sin sesion + cuenta existente  -> entrar, y despues vincular           │
 * │   con sesion                     -> vincular sin pedir nada              │
 * │                                                                          │
 * │ Se decide aqui, sin React, porque el error facil es quedarse encallado:  │
 * │ si desde «entrar» no se puede volver a «crear», quien todavia no tiene   │
 * │ cuenta se queda mirando un formulario que no puede completar. Por eso    │
 * │ la vuelta SIEMPRE lleva a 'crear', que es la unica entrada sin salida    │
 * │ muerta.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type CaminoDeInvitacion = 'crear' | 'entrar' | 'vincular' | 'sinEnlace' | 'esperando';

export function caminoDeInvitacion(
  token: string | null,
  sesion: 'cargando' | 'conSesion' | 'sinSesion',
  eligio: 'crear' | 'entrar',
): CaminoDeInvitacion {
  if (token === null) return 'sinEnlace';
  if (sesion === 'cargando') return 'esperando';
  if (sesion === 'conSesion') return 'vincular';
  return eligio;
}
