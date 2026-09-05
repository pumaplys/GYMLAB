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
/**
 * Las tres frases que dicen lo mismo en las dos puertas.
 *
 * Estaban escritas dos veces —una en `mensajeDeEntrada` y otra en
 * `mensajeDeRestauracion`— y ya habian empezado a ser dos textos distintos que
 * casualmente coincidian. Un fallo de red es un fallo de red tanto si pasa al
 * entrar como si pasa al restaurar la sesion: la persona lee lo mismo.
 */
const RED = 'No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo.';
const SERVIDOR = 'El servicio no está disponible ahora mismo. Inténtalo de nuevo.';
const CONTRATO = 'El servicio ha respondido algo que no esperábamos. Inténtalo de nuevo.';

export function mensajeDeEntrada(problema: unknown): string {
  if (problema instanceof ApiError) {
    // 401 al ENTRAR es una sola cosa: las credenciales no valen.
    if (problema.status === 401) return 'El correo o la contraseña no son correctos.';

    // 400 en el login es validacion de formato del propio contrato.
    if (problema.status === 400) {
      return 'Revisa el correo y la contraseña: falta algo o no tienen el formato correcto.';
    }

    if (problema.status === 429) {
      return 'Demasiados intentos seguidos. Espera un momento antes de volver a probar.';
    }

    return SERVIDOR;
  }

  if (problema instanceof NetworkError) return RED;

  if (problema instanceof ApiResponseError) {
    // Al usuario no le sirve saber que campo del contrato falla; a quien
    // depura, si, y para eso esta el error completo en la consola.
    return CONTRATO;
  }

  return 'Algo ha ido mal. Inténtalo de nuevo.';
}

/** El mismo criterio, para cuando lo que falla es RESTAURAR una sesion. */
export function mensajeDeRestauracion(motivo: 'red' | 'servidor' | 'contrato'): string {
  switch (motivo) {
    case 'red':
      return RED;
    case 'servidor':
      return SERVIDOR;
    case 'contrato':
      return CONTRATO;
  }
}
