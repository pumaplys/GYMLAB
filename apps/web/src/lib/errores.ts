import { ApiError, NetworkError } from '@gymlab/api-client';

/**
 * Que se le enseña a quien esta delante de la pantalla.
 *
 * La regla es una: se muestra lo que esa persona puede entender y, a poder ser,
 * resolver. Lo demas va a la consola, que es donde sirve.
 */
export function mensajeDeError(error: unknown): string {
  // Lo escribio el servidor, en castellano y para leerse: "Credenciales no
  // validas", "Ya existe un socio con ese email". Es el mejor mensaje posible.
  if (error instanceof ApiError) return error.message;

  if (error instanceof NetworkError) {
    return 'No se ha podido contactar con el servidor. Comprueba la conexion e intentalo de nuevo.';
  }

  // Aqui cae, sobre todo, `ApiResponseError`: la API respondio algo que no
  // cumple el contrato. Su mensaje dice que ruta y que campo, que es justo lo
  // que necesita quien tenga que arreglarlo y nada de lo que necesita
  // recepcion. Se registra entero y se muestra algo honesto.
  console.error('[gymlab] error inesperado', error);
  return 'Ha ocurrido un error inesperado. Si vuelve a pasar, avisa a soporte.';
}
