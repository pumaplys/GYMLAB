import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ALL_QUEUES, type EmailJob } from '@gymlab/contracts';
import type { PgBoss } from 'pg-boss' with { 'resolution-mode': 'import' };
import { env } from '../config/env';
import { BOSS } from './jobs.tokens';

/**
 * Consumidor de las colas de correo.
 *
 * Todavia no hay proveedor de correo. El comportamiento es distinto segun el
 * entorno, y a proposito:
 *
 *   fuera de produccion  registra el contenido, token incluido, para poder
 *                        recorrer el flujo completo sin proveedor
 *   en produccion        FALLA. El trabajo se reintenta con espera creciente y
 *                        acaba archivado, que es visible y recuperable
 *
 * Fallar es mas honesto que registrar un aviso y dar el trabajo por bueno: si
 * se completara en silencio, el dia que exista el proveedor nadie sabria que
 * correos se perdieron. Asi quedan en la cola, y al conectar Resend se
 * reintentan solos.
 */
@Injectable()
export class EmailWorker implements OnModuleInit {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(@Inject(BOSS) private readonly boss: PgBoss) {}

  async onModuleInit(): Promise<void> {
    // En los tests no se consumen las colas: se comprueba que el trabajo quedo
    // encolado, que es lo que este modulo tiene que garantizar. Un consumidor
    // corriendo en paralelo solo anadiria carreras.
    if (env.NODE_ENV === 'test') return;

    for (const cola of ALL_QUEUES) {
      await this.boss.work<EmailJob>(cola, async ([job]) => {
        if (!job) return;
        await this.send(cola, job.data);
      });
    }
    this.logger.log(`Escuchando ${ALL_QUEUES.length} colas de correo.`);
  }

  private async send(cola: string, data: EmailJob): Promise<void> {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        `No hay proveedor de correo configurado: no se pudo enviar "${cola}" a ${data.to}.`,
      );
    }

    this.logger.log(
      `[correo simulado] ${cola} -> ${data.to}\n` +
        `  url:   ${data.url}\n` +
        `  token: ${data.token}`,
    );
  }
}
