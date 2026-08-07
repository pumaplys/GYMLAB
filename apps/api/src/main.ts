import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { hayPanel, montar404, montarPanel, rutaDelPanel } from './panel';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ CUANTOS PROXIES HAY DELANTE. DE ESTO DEPENDE EL LIMITE DE INTENTOS.      │
  // │                                                                          │
  // │ `x-forwarded-for` la escribe quien llama y un proxy solo le anade su     │
  // │ valor por la derecha. Sin esto, Express no sabe cuantos saltos descartar │
  // │ y `request.ip` no es de fiar — que es la direccion con la que se cuentan │
  // │ los intentos de login (ver `ipDe`).                                      │
  // │                                                                          │
  // │ Vale 0 en desarrollo, donde no hay proxy. Ponerlo mas alto de lo que hay │
  // │ de verdad es peor que dejarlo a 0.                                       │
  // └──────────────────────────────────────────────────────────────────────────┘
  app.set('trust proxy', env.TRUST_PROXY);

  // Todas las rutas de negocio viven bajo /v1. La app movil tendra versiones
  // antiguas en las tiendas durante meses: el contrato debe ser versionado.
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  // CORS con lista blanca de origenes, no comodin.
  //
  // `credentials: true` es imprescindible para el transporte por cookie del
  // panel web (ADR-0007), y precisamente por eso el origen no puede ser `*`:
  // el navegador rechaza esa combinacion. La app movil no envia `Origin`, asi
  // que no le afecta.
  //
  // Con el panel servido desde aqui NO se usa: no hay peticion entre origenes.
  // Sigue puesto para desarrollo, donde el panel corre en el 3000.
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // Sin esto, NestJS no emite los hooks de apagado y `BossLifecycle` nunca se
  // ejecuta: al desplegar, los trabajos activos de pg-boss se quedarian
  // colgados hasta agotar su tiempo en lugar de terminar ordenadamente.
  app.enableShutdownHooks();

  // El panel, ANTES del enrutador: reescribe `/socios` a `/socios.html` y sirve
  // los ficheros. Lo que no sea suyo cae hacia los controladores.
  montarPanel(app);

  // Y el 404, DESPUES: antes se quedaria con la aplicacion entera.
  await app.init();
  montar404(app);

  const port = env.API_PORT;
  await app.listen(port);

  console.log(`[api] escuchando en http://localhost:${port}`);
  console.log(
    hayPanel()
      ? `[api] sirviendo el panel desde ${rutaDelPanel()} — mismo origen`
      : '[api] sin panel construido: solo API (en desarrollo lo sirve `next dev`)',
  );
}

void bootstrap();
