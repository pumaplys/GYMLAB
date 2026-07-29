import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EMAIL_QUEUES, type EmailJob } from '@gymlab/db';
import type { PgBoss } from 'pg-boss' with { 'resolution-mode': 'import' };
import { MAILER } from '../mail/mail.tokens';
import { MailError, type Mailer } from '../mail/mailer';
import { renderizar } from '../mail/templates';
import { env } from '../config/env';
import { BOSS } from './jobs.tokens';

const COLAS_DE_CORREO: readonly string[] = Object.values(EMAIL_QUEUES);

/**
 * Consumidor de las colas de correo.
 *
 * MANEJO DE ERRORES: la distincion que importa es si reintentar puede ayudar.
 *
 *   Transitorio  limite de peticiones, caida puntual del proveedor, red.
 *                Se lanza y pg-boss reintenta con espera creciente.
 *
 *   Definitivo   email mal formado, remitente sin verificar, clave invalida.
 *                Reintentar no cambiaria nada. Se registra como ERROR y el
 *                trabajo se da por terminado.
 *
 * Ante un error DESCONOCIDO se reintenta, que es el lado seguro: perder un
 * correo por no insistir es peor que insistir de mas.
 *
 * Un definitivo NO se lanza a proposito. Agotar cinco reintentos sobre una
 * direccion que nunca va a funcionar llena el log de ruido y entierra la causa
 * real; el ERROR con contexto completo es mas util que cinco intentos identicos.
 */
@Injectable()
export class EmailWorker implements OnModuleInit {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(
    @Inject(BOSS) private readonly boss: PgBoss,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async onModuleInit(): Promise<void> {
    // En los tests no se consumen las colas: se comprueba que el trabajo queda
    // encolado, y el envio se ejercita llamando a `procesar()` directamente. Un
    // consumidor corriendo en paralelo solo anadiria carreras.
    if (env.NODE_ENV === 'test') return;

    for (const cola of COLAS_DE_CORREO) {
      await this.boss.work<EmailJob>(cola, async ([job]) => {
        if (job) await this.procesar(cola, job.data);
      });
    }
    this.logger.log(`Escuchando ${COLAS_DE_CORREO.length} colas de correo.`);
  }

  /**
   * Envia un correo de una cola. Publico para que los tests lo ejerciten sin
   * depender del planificador de pg-boss.
   *
   * Lanza solo si merece la pena reintentar.
   */
  async procesar(cola: string, data: EmailJob): Promise<void> {
    try {
      await this.mailer.send(renderizar(cola, data));
    } catch (error) {
      const definitivo = error instanceof MailError && !error.retryable;

      if (definitivo) {
        this.logger.error(
          `Envio descartado sin reintento — cola "${cola}", motivo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }

      this.logger.warn(
        `Envio fallido en "${cola}", se reintentara: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
