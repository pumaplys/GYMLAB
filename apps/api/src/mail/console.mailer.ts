import { Logger } from '@nestjs/common';
import type { Mailer, MailMessage } from './mailer';

/**
 * Transporte de desarrollo: registra el correo en lugar de enviarlo.
 *
 * Permite recorrer los flujos completos —invitacion, restablecer contrasena—
 * sin cuenta de Resend ni dominio verificado. Imprime el texto plano, que es
 * donde estan los enlaces en claro.
 *
 * NUNCA se usa en produccion: `MailModule` lo impide al arrancar.
 */
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger('ConsoleMailer');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(
      [
        '',
        '─────────── CORREO SIMULADO ───────────',
        `Para:    ${message.to}`,
        `Asunto:  ${message.subject}`,
        '',
        message.text,
        '───────────────────────────────────────',
      ].join('\n'),
    );
  }
}
