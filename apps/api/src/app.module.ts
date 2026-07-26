import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Modulo raiz del monolito modular.
 *
 * Fase 0: solo el arranque y el healthcheck.
 *
 * En Fase 1 aqui se importan los modulos de dominio, cada uno en
 * src/modules/<nombre>/ con su propio module, controller, service y repositorio:
 *
 *   identity · organization · members · staff · billing
 *   training · progress · access · analytics · platform
 *
 * REGLA DE ORO: un modulo NUNCA importa el repositorio de otro. Se comunica
 * con el servicio de aplicacion del otro modulo. Es la unica disciplina que
 * mantiene viva la opcion de extraer un modulo mas adelante.
 */
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
