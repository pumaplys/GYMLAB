import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { authEvents, MAINTENANCE_QUEUES, sql, withoutTenant, type Database } from '@gymlab/db';
import type { PgBoss } from 'pg-boss' with { 'resolution-mode': 'import' };
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';
import { BOSS } from './jobs.tokens';

/**
 * Purga de `auth_events`.
 *
 * `auth_events` guarda IP y user-agent, que son datos personales. El RGPD exige
 * limitar el plazo de conservacion (art. 5.1.e): guardarlos indefinidamente sin
 * justificacion es incumplimiento, no descuido.
 *
 * 90 dias es el plazo que ya estaba escrito en el esquema y en ADR-0007; lo
 * unico que faltaba era ejecutarlo.
 *
 * Se apoya en el `schedule` de pg-boss, que guarda la programacion en Postgres:
 * con varias instancias, solo una ejecuta cada disparo. Un `setInterval` en el
 * proceso lo lanzaria tantas veces como instancias hubiera.
 */
/** Coincide con lo documentado en el esquema y en ADR-0007. */
const DIAS_DE_RETENCION = 90;

@Injectable()
export class RetentionWorker implements OnModuleInit {
  private readonly logger = new Logger(RetentionWorker.name);

  constructor(
    @Inject(BOSS) private readonly boss: PgBoss,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async onModuleInit(): Promise<void> {
    // En los tests no se programa nada: la purga se comprueba llamando
    // directamente a `purgar()`, sin depender de un reloj.
    if (env.NODE_ENV === 'test') return;

    // Todos los dias a las 04:00. La cola la crea `pnpm db:migrate` con el rol
    // propietario, porque crearla implica DDL.
    await this.boss.schedule(MAINTENANCE_QUEUES.retentionAuthEvents, '0 4 * * *');
    await this.boss.work(MAINTENANCE_QUEUES.retentionAuthEvents, async () => {
      const borrados = await this.purgar();
      this.logger.log(`Purgados ${borrados} eventos de autenticacion caducados.`);
    });
  }

  /** Devuelve cuantas filas se han borrado. */
  async purgar(): Promise<number> {
    const resultado = await withoutTenant(this.db, (tx) =>
      tx.execute(
        sql`DELETE FROM ${authEvents}
            WHERE created_at < now() - ${`${DIAS_DE_RETENCION} days`}::interval`,
      ),
    );
    return resultado.rowCount ?? 0;
  }
}
