import { Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { env } from '../config/env';
import { MailError, type Mailer, type MailMessage } from './mailer';

/**
 * Errores de Resend que NO mejoran reintentando.
 *
 * Un email mal formado seguira mal formado dentro de una hora, y un dominio sin
 * verificar no se verifica solo. Reintentar estos cinco veces no arregla nada y
 * entierra la causa entre ruido de logs.
 *
 * Lo que si merece reintento —limite de peticiones, caidas puntuales del
 * proveedor— queda fuera de esta lista por omision, que es el lado seguro: ante
 * un error desconocido, se reintenta.
 */
const ERRORES_DEFINITIVOS = new Set([
  'validation_error',
  'invalid_parameter',
  'missing_required_field',
  'invalid_from_address',
  'not_found',
  'invalid_api_key',
  'restricted_api_key',
]);

export class ResendMailer implements Mailer {
  private readonly logger = new Logger(ResendMailer.name);
  private readonly resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(message: MailMessage): Promise<void> {
    // Resend no lanza: devuelve `{ data, error }`. Tratarlo como si lanzara
    // haria que los fallos pasaran desapercibidos.
    const { data, error } = await this.resend.emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      const definitivo = ERRORES_DEFINITIVOS.has(error.name);
      throw new MailError(
        `Resend rechazo el envio a ${message.to}: ${error.name} — ${error.message}`,
        !definitivo,
        error,
      );
    }

    // El id permite rastrear el correo en el panel de Resend si alguien dice
    // que no lo ha recibido. El destinatario NO se registra completo: es un dato
    // personal y los logs suelen acabar en sitios con menos control que la BD.
    this.logger.log(`Correo enviado (${data?.id ?? 'sin id'}) a ${ofuscar(message.to)}`);
  }
}

/** `ana.lopez@gimnasio.com` -> `an***@gimnasio.com` */
function ofuscar(email: string): string {
  const [usuario, dominio] = email.split('@');
  if (!usuario || !dominio) return '***';
  return `${usuario.slice(0, 2)}***@${dominio}`;
}
