import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

/**
 * Identidad juridica del responsable del tratamiento.
 *
 * Exporta `LegalService` porque el modulo de consentimientos lo necesita para
 * congelar el responsable al publicar un documento, y ADR-0006 le prohibe leer
 * `organizations` por su cuenta.
 */
@Module({
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
