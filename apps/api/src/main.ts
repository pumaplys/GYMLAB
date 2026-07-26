import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas las rutas de negocio viven bajo /v1. La app movil tendra versiones
  // antiguas en las tiendas durante meses: el contrato debe ser versionado.
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`[api] escuchando en http://localhost:${port}`);
}

void bootstrap();
