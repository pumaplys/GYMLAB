/**
 * En que punto esta el permiso de camara. Sin React y sin `expo-camera`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DENEGADO Y BLOQUEADO NO SON LO MISMO, Y LA PANTALLA NO PUEDE MENTIR.     │
 * │                                                                          │
 * │ La primera vez que se dice que no, iOS y Android dejan volver a          │
 * │ preguntar: ahi un boton «Permitir la cámara» funciona.                   │
 * │                                                                          │
 * │ Despues, el sistema NO vuelve a enseñar el dialogo nunca mas. Un boton   │
 * │ que promete pedirlo se queda sin hacer nada al pulsarlo, y quien esta en │
 * │ el mostrador acaba pensando que la app esta rota. Cuando ya no se puede  │
 * │ preguntar, lo unico honesto es decir donde se arregla: en los ajustes    │
 * │ del telefono.                                                            │
 * │                                                                          │
 * │ `canAskAgain` es justo esa diferencia, y por eso se mira.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Lo minimo que se necesita de `PermissionResponse` de expo. */
export interface RespuestaDePermiso {
  granted: boolean;
  canAskAgain: boolean;
}

export type EstadoDelPermiso =
  /** Todavia no ha contestado el sistema. */
  | 'consultando'
  | 'concedido'
  /** Dijo que no, pero se puede volver a preguntar. */
  | 'denegado'
  /** Dijo que no y el sistema ya no preguntara: hay que ir a los ajustes. */
  | 'bloqueado';

export function estadoDelPermiso(respuesta: RespuestaDePermiso | null): EstadoDelPermiso {
  if (respuesta === null) return 'consultando';
  if (respuesta.granted) return 'concedido';
  return respuesta.canAskAgain ? 'denegado' : 'bloqueado';
}

/** Si tiene sentido enseñar un boton que pide el permiso. */
export function puedePedirse(estado: EstadoDelPermiso): boolean {
  return estado === 'denegado';
}
