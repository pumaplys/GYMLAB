/**
 * La maquina de estados de la sesion, sin React y sin red.
 *
 * Vive aparte del proveedor a proposito: son las decisiones que hay que poder
 * probar —y las que es facil equivocar— y no necesitan un componente montado
 * para comprobarse.
 */
import type { Me } from '@gymlab/contracts';

export type EstadoDeSesion =
  /** Todavia no sabemos: se esta leyendo el almacen o preguntando al servidor. */
  | { tipo: 'cargando' }
  /** Hay sesion y la cuenta puede usar esta app. */
  | { tipo: 'autenticado'; yo: Me; gymId: string }
  /** No hay sesion, o la que habia ya no vale. */
  | { tipo: 'sinSesion' }
  /**
   * Hay sesion valida, pero NO es de un socio.
   *
   * Es un estado propio y no un `sinSesion` con otro mensaje: la persona ha
   * entrado bien, y decirle "credenciales incorrectas" seria mentirle. La app
   * movil es del socio; el personal usa el panel web.
   */
  | { tipo: 'rolNoAdmitido'; yo: Me }
  /**
   * No se pudo hablar con el servidor.
   *
   * NO borra el token. Es el estado que impide confundir "tu sesion ha
   * caducado" con "el metro no tiene cobertura".
   */
  | { tipo: 'sinConexion' };

/** Lo que puede pasar al intentar resolver la sesion al arrancar. */
export type Resultado =
  | { clase: 'sinToken' }
  | { clase: 'yo'; yo: Me }
  | { clase: 'noAutorizado' }
  | { clase: 'errorDeRed' };

/**
 * Si la cuenta puede usar la app movil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE MIRA LA MEMBRESIA DEL GIMNASIO ACTIVO, NO "LA PRIMERA QUE HAYA".      │
 * │                                                                          │
 * │ Una misma persona puede ser socia de un gimnasio y entrenadora de otro:  │
 * │ el modelo lo permite. Quien manda es el gimnasio ACTIVO de la sesion.    │
 * │                                                                          │
 * │ Y `member` es el unico rol admitido, en positivo. Escribirlo como "todo  │
 * │ menos owner" dejaria entrar a cualquier rol que se anada en el futuro.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function membresiaDeSocio(yo: Me): { gymId: string } | null {
  const activa = yo.memberships.find((m) => m.gymId === yo.activeGymId);
  if (activa?.role === 'member') return { gymId: activa.gymId };
  return null;
}

/**
 * De un resultado, un estado. Toda la politica de sesion en una funcion.
 *
 * El caso que mas importa es el ultimo: un fallo de red NO cierra la sesion.
 * Quien decide que un token ya no vale es el servidor con un 401, no la
 * ausencia de cobertura.
 */
export function decidirEstado(resultado: Resultado): EstadoDeSesion {
  switch (resultado.clase) {
    case 'sinToken':
      return { tipo: 'sinSesion' };

    case 'noAutorizado':
      return { tipo: 'sinSesion' };

    case 'errorDeRed':
      return { tipo: 'sinConexion' };

    case 'yo': {
      const socio = membresiaDeSocio(resultado.yo);
      if (!socio) return { tipo: 'rolNoAdmitido', yo: resultado.yo };
      return { tipo: 'autenticado', yo: resultado.yo, gymId: socio.gymId };
    }
  }
}

/**
 * Si hay que borrar el token guardado ante este resultado.
 *
 * Solo un 401. Un error de red deja el token donde esta: puede seguir siendo
 * perfectamente valido y borrarlo obligaria a volver a escribir la contrasena
 * por haber pasado por un tunel.
 */
export function debeBorrarToken(resultado: Resultado): boolean {
  return resultado.clase === 'noAutorizado';
}
