import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from '@gymlab/db';
import type { PgBoss } from 'pg-boss' with { 'resolution-mode': 'import' };
import { getRequestContext } from '../common/request-context';
import { BOSS } from './jobs.tokens';

/**
 * Encolado de trabajos.
 *
 * ESTE ES EL PATRON TRANSACTIONAL OUTBOX QUE PROMETIA ADR-0008.
 *
 * pg-boss guarda sus trabajos en Postgres, asi que si el INSERT del trabajo va
 * dentro de la transaccion de la peticion, el trabajo y los datos commitean
 * juntos o no commitea ninguno:
 *
 *   - Nunca un email de invitacion sobre una invitacion que no llego a crearse.
 *   - Nunca una invitacion creada cuyo email nadie encolo.
 *
 * Lo que normalmente cuesta una tabla de outbox, un proceso que la lee y un
 * monton de casos raros, aqui sale de combinar dos decisiones que ya estaban
 * tomadas por separado.
 *
 * Cuando no hay transaccion —rutas publicas sin gimnasio activo, como
 * forgot-password— se encola contra el pool. En esos flujos no hay nada con lo
 * que ser atomico: la fila del token la escribe Better Auth por su cuenta.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(@Inject(BOSS) private readonly boss: PgBoss) {}

  async enqueue(queue: string, data: Record<string, unknown>): Promise<void> {
    const tx = getRequestContext()?.tx;

    if (tx) {
      const { fromDrizzle } = await import('pg-boss');
      await this.boss.send(queue, data, { db: fromDrizzle(tx, sql) });
    } else {
      await this.boss.send(queue, data);
    }

    this.logger.debug(`encolado ${queue}${tx ? ' (en transaccion)' : ''}`);
  }
}
