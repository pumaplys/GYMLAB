/**
 * Contrato del transporte de correo.
 *
 * Existe por dos razones concretas, no por gusto de abstraer:
 *
 * 1. Los tests no pueden llamar a Resend. Con esta frontera, la bateria
 *    sustituye el transporte por uno que captura los mensajes y comprueba
 *    destinatario, asunto y contenido de verdad.
 *
 * 2. En desarrollo no hace falta cuenta de Resend: el transporte de consola
 *    registra el correo y el flujo completo se puede recorrer igual.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Fallo de envio, con la distincion que importa para los reintentos.
 *
 * `retryable: false` significa que reintentar no va a cambiar nada — un email
 * mal formado seguira mal formado dentro de una hora. Reintentarlo cinco veces
 * solo esconde el problema entre ruido.
 */
export class MailError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    // `override` porque Error ya define `cause`: se conserva ese nombre estandar
    // para que cualquier herramienta que inspeccione errores lo encuentre.
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MailError';
  }
}
