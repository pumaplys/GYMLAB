import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas las rutas de negocio viven bajo /v1. La app movil tendra versiones
  // antiguas en las tiendas durante meses: el contrato debe ser versionado.
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  // CORS con lista blanca de origenes, no comodin.
  //
  // `credentials: true` es imprescindible para el transporte por cookie del
  // panel web (ADR-0007), y precisamente por eso el origen no puede ser `*`:
  // el navegador rechaza esa combinacion. La app movil no envia `Origin`, asi
  // que no le afecta.
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // Sin esto, NestJS no emite los hooks de apagado y `BossLifecycle` nunca se
  // ejecuta: al desplegar, los trabajos activos de pg-boss se quedarian
  // colgados hasta agotar su tiempo en lugar de terminar ordenadamente.
  app.enableShutdownHooks();

  const port = env.API_PORT;
  await app.listen(port);

  console.log(`[api] escuchando en http://localhost:${port}`);
}

void bootstrap();
