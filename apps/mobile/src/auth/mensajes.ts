import { ApiError, ApiResponseError, NetworkError } from '@gymlab/api-client';

/**
 * De una excepcion, una frase que se le puede enseñar a una persona.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NUNCA "Error 401" NI "NetworkError".                                     │
 * │                                                                          │
 * │ Un codigo de estado no le dice nada a quien esta intentando entrar en el │
 * │ gimnasio, y un nombre de clase de JavaScript menos todavia. Lo que hace  │
 * │ falta saber es QUE PASO y QUE HACER: volver a escribir la contrasena,    │
 * │ mirar la conexion, o esperar.                                            │
 * │                                                                          │
 * │ Tampoco se reenvia el mensaje del servidor tal cual en los 5xx: puede    │
 * │ traer detalle interno, y no es asunto de quien solo queria entrenar.     │
 * │ En el 401 SI se usa el nuestro, porque el del servidor podria variar y   │
 * │ el mensaje correcto aqui es siempre el mismo.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Es logica pura y se prueba como tal.
 */
export function mensajeDeEntrada(problema: unknown): string {
  if (problema instanceof ApiError) {
    // 401 al ENTRAR es una sola cosa: las credenciales no valen.
    if (problema.status === 401) return 'El correo o la contrasena no son correctos.';

    // 400 en el login es validacion de formato del propio contrato.
    if (problema.status === 400) {
      return 'Revisa el correo y la contrasena: falta algo o no tienen el formato correcto.';
    }

    if (problema.status === 429) {
      return 'Demasiados intentos seguidos. Espera un momento antes de volver a probar.';
    }

    return 'El servicio no esta disponible ahora mismo. Intentalo de nuevo.';
  }

  if (problema instanceof NetworkError) {
    return 'No pudimos conectar. Comprueba tu conexion e intentalo de nuevo.';
  }

  if (problema instanceof ApiResponseError) {
    // Al usuario no le sirve saber que campo del contrato falla; a quien
    // depura, si, y para eso esta el error completo en la consola.
    return 'El servicio ha respondido algo que no esperabamos. Intentalo de nuevo.';
  }

  return 'Algo ha ido mal. Intentalo de nuevo.';
}

/** El mismo criterio, para cuando lo que falla es RESTAURAR una sesion. */
export function mensajeDeRestauracion(motivo: 'red' | 'servidor' | 'contrato'): string {
  switch (motivo) {
    case 'red':
      return 'No pudimos conectar. Comprueba tu conexion e intentalo de nuevo.';
    case 'servidor':
      return 'El servicio no esta disponible ahora mismo. Intentalo de nuevo.';
    case 'contrato':
      return 'El servicio ha respondido algo que no esperabamos. Intentalo de nuevo.';
  }
}
