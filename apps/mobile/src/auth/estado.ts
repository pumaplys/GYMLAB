/**
 * La maquina de estados de la sesion, sin React y sin red.
 *
 * Vive aparte del proveedor a proposito: son las decisiones que hay que poder
 * probar —y las que es facil equivocar— y no necesitan un componente montado
 * para comprobarse.
 */
import type { Me } from '@gymlab/contracts';

/**
 * Una membresia, derivada de `Me`.
 *
 * `@gymlab/contracts` no exporta el tipo suelto y NO se toca: esta bajo
 * freeze y no hace falta. Derivarlo del contrato que si exporta da
 * exactamente el mismo tipo y se mueve solo si el contrato se mueve.
 */
export type Membresia = Me['memberships'][number];

export type EstadoDeSesion =
  /** Todavia no sabemos: se esta leyendo el almacen o preguntando al servidor. */
  | { tipo: 'cargando' }
  /** Hay sesion, hay gimnasio activo y en el se es socio. */
  | { tipo: 'autenticado'; yo: Me; gymId: string }
  /** No hay sesion, o la que habia ya no vale. */
  | { tipo: 'sinSesion' }
  /**
   * Hay sesion valida, pero en ningun gimnasio se es socio.
   *
   * Es un estado propio y no un `sinSesion` con otro mensaje: la persona ha
   * entrado bien, y decirle "credenciales incorrectas" seria mentirle. La app
   * movil es del socio; el personal usa el panel web.
   */
  | { tipo: 'rolNoAdmitido'; yo: Me }
  /**
   * Es socio, pero la sesion no tiene gimnasio activo y hay que elegir.
   *
   * NO se elige aqui. Ver el comentario de `resolverAcceso`.
   */
  | { tipo: 'requiereSeleccionGimnasio'; yo: Me; opciones: readonly Membresia[] }
  /**
   * Se pudo leer el token pero no confirmar la sesion.
   *
   * NO borra el token. Es lo que separa "tu sesion ha caducado" de "el
   * servidor devuelve 500" o "no hay cobertura": en los dos ultimos casos la
   * sesion puede seguir siendo perfectamente valida.
   */
  | { tipo: 'errorAlComprobar'; motivo: MotivoDeError; status?: number };

export type MotivoDeError =
  /** No hubo respuesta: sin red, DNS, servidor caido. */
  | 'red'
  /** Hubo respuesta, y no fue un 401: 403, 404, 429, 5xx… */
  | 'servidor'
  /** Respondio 2xx pero el cuerpo no cumple el contrato. */
  | 'contrato';

/** Lo que puede pasar al intentar resolver la sesion. */
export type Resultado =
  | { clase: 'sinToken' }
  | { clase: 'yo'; yo: Me }
  /** SOLO un 401. */
  | { clase: 'sesionInvalida' }
  | { clase: 'errorDeRed' }
  | { clase: 'errorDelServidor'; status: number }
  | { clase: 'respuestaInvalida' };

/** Las membresias en las que esta persona es socia. */
export function membresiasDeSocio(yo: Me): readonly Membresia[] {
  return yo.memberships.filter((m) => m.role === 'member');
}

/**
 * Que hacer con esta cuenta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE ELIGE GIMNASIO. NI SIQUIERA CUANDO SOLO HAY UNO.              │
 * │                                                                          │
 * │ La regla de seleccion automatica YA EXISTE y es del servidor:            │
 * │                                                                          │
 * │   auth.service.ts:200                                                    │
 * │   const activeGymId = propias.length === 1 ? propias[0].gymId : null;    │
 * │                                                                          │
 * │ Con UNA membresia el servidor la fija al entrar; con varias devuelve     │
 * │ null a proposito, porque adivinar cual quiere es peor que preguntar.     │
 * │                                                                          │
 * │ Si `activeGymId` viene a null, es que el servidor DECIDIO no elegir.     │
 * │ Elegir aqui seria inventar una segunda politica al lado de la suya —y    │
 * │ ademas una que el servidor no conoce, porque el rol se recalcula al      │
 * │ cambiar de gimnasio—. Se ofrece elegir y se llama a `switchGym`, que es  │
 * │ lo que ya hace el panel web.                                            │
 * │                                                                          │
 * │ El rol se mira SIEMPRE en el gimnasio activo, no "en la primera          │
 * │ membresia que haya": una misma persona puede ser socia de un gimnasio y  │
 * │ entrenadora de otro, y el modelo lo permite.                             │
 * │                                                                          │
 * │ Y `member` se comprueba en POSITIVO. Escrito como "todo menos owner",    │
 * │ cualquier rol que se anadiera en el futuro entraria sin que nadie lo     │
 * │ decidiera.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function resolverAcceso(yo: Me): EstadoDeSesion {
  const activa = yo.activeGymId
    ? yo.memberships.find((m) => m.gymId === yo.activeGymId)
    : undefined;

  // Hay gimnasio activo: manda su rol, y solo el suyo.
  if (activa) {
    return activa.role === 'member'
      ? { tipo: 'autenticado', yo, gymId: activa.gymId }
      : { tipo: 'rolNoAdmitido', yo };
  }

  // Sin gimnasio activo. Si no es socia en ninguno, esta app no es para ella.
  const comoSocio = membresiasDeSocio(yo);
  if (comoSocio.length === 0) return { tipo: 'rolNoAdmitido', yo };

  // Es socia en uno o en varios: que elija.
  return { tipo: 'requiereSeleccionGimnasio', yo, opciones: comoSocio };
}

/** De un resultado, un estado. Toda la politica de sesion en una funcion. */
export function decidirEstado(resultado: Resultado): EstadoDeSesion {
  switch (resultado.clase) {
    case 'sinToken':
    case 'sesionInvalida':
      return { tipo: 'sinSesion' };

    case 'errorDeRed':
      return { tipo: 'errorAlComprobar', motivo: 'red' };

    case 'errorDelServidor':
      return { tipo: 'errorAlComprobar', motivo: 'servidor', status: resultado.status };

    case 'respuestaInvalida':
      return { tipo: 'errorAlComprobar', motivo: 'contrato' };

    case 'yo':
      return resolverAcceso(resultado.yo);
  }
}

/**
 * Si hay que borrar el token guardado ante este resultado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO UN 401. NI 403, NI 429, NI 500, NI UN FALLO DE RED.                │
 * │                                                                          │
 * │ La primera version preguntaba "¿el error trae `status`?" y daba por      │
 * │ invalida la sesion en cuanto lo traia. Con eso, un 500 del servidor o un │
 * │ 429 por exceso de peticiones echaban de la app a alguien cuya sesion     │
 * │ seguia siendo perfectamente valida, y le obligaban a escribir la         │
 * │ contrasena otra vez por un problema que no era suyo.                     │
 * │                                                                          │
 * │ Quien decide que un token ya no vale es el servidor diciendo 401. Todo   │
 * │ lo demas se reintenta.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function debeBorrarToken(resultado: Resultado): boolean {
  return resultado.clase === 'sesionInvalida';
}
