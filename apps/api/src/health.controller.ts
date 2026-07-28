import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql, type Database } from '@gymlab/db';
import { Public } from './common/decorators/public.decorator';
import { DATABASE } from './database/database.module';

/**
 * Healthcheck. No es funcionalidad de producto: es infraestructura.
 *
 * COMPRUEBA LA BASE DE DATOS, y eso no es un adorno. Antes respondia `ok` con
 * Postgres caido, asi que un orquestador habria dado el servicio por sano y le
 * habria seguido mandando trafico — o peor, habria considerado buena una
 * version recien desplegada que no puede atender una sola peticion.
 *
 * Un healthcheck que no puede fallar no informa de nada.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'gymlab-api',
        reason: 'base de datos no disponible',
      });
    }

    return {
      status: 'ok',
      service: 'gymlab-api',
      timestamp: new Date().toISOString(),
    };
  }
}
