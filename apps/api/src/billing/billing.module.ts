import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { BillingDataContributor } from './billing-data.contributor';
import {
  MemberBillingController,
  OwnDuesController,
  OwnPaymentsController,
  PaymentsController,
  PlansController,
} from './billing.controller';
import { BillingService } from './billing.service';

/**
 * `billing -> members` es la UNICA direccion entre estos dos modulos.
 *
 * Este pide a `MembersService` que valide al socio (ADR-0006: se pide al
 * servicio de aplicacion, nunca se lee su tabla). El sentido contrario —aportar
 * cuotas y pagos a la exportacion del art. 15— va por el punto de extension de
 * ADR-0011, y por eso `BillingDataContributor` no depende de `BillingService`:
 * si dependiera, el grafo de proveedores se cerraria y Nest se colgaria en el
 * arranque sin dar ningun error.
 */
@Module({
  imports: [MembersModule],
  controllers: [
    PlansController,
    MemberBillingController,
    PaymentsController,
    OwnDuesController,
    OwnPaymentsController,
  ],
  providers: [BillingService, BillingDataContributor],
  exports: [BillingService, BillingDataContributor],
})
export class BillingModule {}
