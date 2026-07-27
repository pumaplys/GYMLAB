import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { assertRlsIsEnforced, createDatabase, type Database } from '@gymlab/db';
import { env } from '../config/env';

export const DATABASE = Symbol('DATABASE');

/**
 * Comprueba al arrancar que la conexion NO puede saltarse Row Level Security.
 *
 * Si la API se conectase con el rol propietario, RLS estaria habilitado, las
 * politicas escritas, los tests en verde... y el aislamiento entre gimnasios
 * seria inexistente, sin ningun error que lo delatase (ver ADR-002).
 *
 * Por eso se aborta el arranque en lugar de avisar: un proceso que no puede
 * garantizar el aislamiento no debe aceptar trafico.
 */
@Injectable()
class RlsStartupCheck implements OnModuleInit {
  private readonly logger = new Logger('RlsStartupCheck');

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onModuleInit(): Promise<void> {
    await assertRlsIsEnforced(this.db);
    this.logger.log('Aislamiento verificado: la conexion esta sujeta a RLS.');
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database =>
        createDatabase({ connectionString: env.DATABASE_URL_APP, max: 10 }),
    },
    RlsStartupCheck,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
