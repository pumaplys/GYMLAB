import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MembersModule } from '../members/members.module';
import {
  AccessController,
  GymSettingsController,
  OwnAccessController,
} from './access.controller';
import { AccessService } from './access.service';
import { GymSettingsService } from './gym-settings.service';

/**
 * `access -> billing -> members`, y solo en esa direccion.
 *
 * El QR pregunta si el socio esta al corriente; `billing` responde con
 * `puedeAcceder` ya resuelto. Nadie llama de vuelta hacia aqui, asi que no hay
 * punto de extension que cablear ni ciclo que romper — a diferencia de lo que
 * paso con invitaciones (ADR-0010) y con la exportacion RGPD (ADR-0011).
 */
@Module({
  imports: [MembersModule, BillingModule],
  controllers: [OwnAccessController, AccessController, GymSettingsController],
  providers: [AccessService, GymSettingsService],
  exports: [AccessService],
})
export class AccessModule {}
