import { Global, Logger, Module } from '@nestjs/common';
import { env } from '../config/env';
import { ConsoleMailer } from './console.mailer';
import { MAILER } from './mail.tokens';
import { ResendMailer } from './resend.mailer';
import type { Mailer } from './mailer';

/**
 * Elige el transporte de correo segun la configuracion.
 *
 * Con `RESEND_API_KEY` se envia de verdad; sin ella se registra en consola, lo
 * que permite trabajar en local sin cuenta de Resend.
 *
 * ARRANCAR EN PRODUCCION SIN CLAVE ES UN ERROR, y el proceso muere diciendolo.
 * La alternativa —caer al transporte de consola en silencio— significaria que
 * nadie recibe invitaciones ni puede recuperar su contrasena, y que el log
 * parece normal. Un fallo que no se ve es peor que una caida.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      useFactory: (): Mailer => {
        const logger = new Logger('MailModule');

        if (env.RESEND_API_KEY) {
          logger.log(`Correo por Resend, remitente: ${env.EMAIL_FROM}`);
          return new ResendMailer(env.RESEND_API_KEY);
        }

        if (env.NODE_ENV === 'production') {
          throw new Error(
            '[mail] Falta RESEND_API_KEY en produccion. Sin ella nadie recibiria ' +
              'invitaciones ni podria restablecer su contrasena, y el log no lo delataria.',
          );
        }

        logger.warn('Sin RESEND_API_KEY: los correos se registran en consola, no se envian.');
        return new ConsoleMailer();
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
