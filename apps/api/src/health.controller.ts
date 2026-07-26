import { Controller, Get } from '@nestjs/common';

/**
 * Healthcheck. No es funcionalidad de producto: es infraestructura.
 * Lo usan el proveedor de hosting para el despliegue y tu para comprobar
 * que el entorno local levanta.
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'gymlab-api',
      timestamp: new Date().toISOString(),
    };
  }
}
