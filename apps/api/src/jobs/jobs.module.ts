import { Global, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
// `resolution-mode` es obligatorio para importar tipos de un paquete ESM desde
// un modulo CommonJS. Es el mismo desajuste que ya teniamos con Better Auth.
import type { PgBoss } from 'pg-boss' with { 'resolution-mode': 'import' };
import { env } from '../config/env';
import { EmailWorker } from './email.worker';
import { JobsService } from './jobs.service';
import { RetentionWorker } from './retention.worker';
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
        const logger = new Logger('PgBoss');
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
          // En los tests no se consumen colas ni hace falta mantenimiento, y su
          // trafico de fondo solo anade ruido y conexiones a una base de datos
          // que ya esta compartida por varios ficheros de test.
          supervise: env.NODE_ENV !== 'test',
          schedule: env.NODE_ENV !== 'test',
        });

        /*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ SIN ESTE LISTENER, UN HIPO DE POSTGRES MATA LA API ENTERA.       │
         * │                                                                  │
         * │ `PgBoss` es un `EventEmitter`, y en Node un emisor que emite     │
         * │ `'error'` SIN listener registrado lanza la excepcion — que nadie │
         * │ captura, asi que el proceso termina.                             │
         * │                                                                  │
         * │ Reproducido parando Postgres con la API en marcha: murio en dos  │
         * │ segundos con `Unhandled 'error' event` y                          │
         * │ `terminating connection due to administrator command` (57P01).   │
         * │                                                                  │
         * │ En produccion eso significa que un reinicio de la base de datos, │
         * │ un failover o un corte de red se llevan por delante toda la API: │
         * │ el socio no puede abrir su QR en la puerta porque una COLA DE    │
         * │ CORREOS perdio la conexion.                                      │
         * │                                                                  │
         * │ Registrarlo no "traga" el error: lo deja anotado y devuelve el   │
         * │ control a pg-boss, que reintenta con su propio pool. Lo que se   │
         * │ evita es que un fallo de un subsistema secundario derribe el     │
         * │ principal.                                                        │
         * └──────────────────────────────────────────────────────────────────┘
         */
        boss.on('error', (error: unknown) => {
          logger.error(
            `pg-boss: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : undefined,
          );
        });

        await boss.start();
        return boss;
      },
    },
    JobsService,
    EmailWorker,
    RetentionWorker,
    BossLifecycle,
  ],
  exports: [BOSS, JobsService],
})
export class JobsModule {}
