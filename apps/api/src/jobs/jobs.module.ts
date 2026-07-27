import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
// `resolution-mode` es obligatorio para importar tipos de un paquete ESM desde
// un modulo CommonJS. Es el mismo desajuste que ya teniamos con Better Auth.
import type { PgBoss } from 'pg-boss' with { 'resolution-mode': 'import' };
import { env } from '../config/env';
import { EmailWorker } from './email.worker';
import { JobsService } from './jobs.service';
import { BOSS } from './jobs.tokens';

/**
 * Cierra pg-boss al apagar el proceso, para que los trabajos en curso terminen
 * en lugar de quedarse colgados en estado activo hasta agotar su tiempo.
 */
@Injectable()
class BossLifecycle implements OnApplicationShutdown {
  constructor(@Inject(BOSS) private readonly boss: PgBoss) {}

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: BOSS,
      useFactory: async (): Promise<PgBoss> => {
        // pg-boss v12 se publica solo como ESM y sin export por defecto: la
        // clase es un named export. Importacion dinamica por el mismo motivo
        // que Better Auth — esta aplicacion compila a CommonJS.
        const { PgBoss: PgBossCtor } = await import('pg-boss');

        const boss = new PgBossCtor({
          connectionString: env.DATABASE_URL_APP,
          // El esquema y las colas los crea `pnpm db:migrate` con el rol
          // propietario: pg-boss hace DDL y `gymlab_app` no puede —ni debe—
          // crear nada. Mismo reparto que con las migraciones.
          migrate: false,
        });

        await boss.start();
        return boss;
      },
    },
    JobsService,
    EmailWorker,
    BossLifecycle,
  ],
  exports: [BOSS, JobsService],
})
export class JobsModule {}
