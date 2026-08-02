import { Global, Module } from '@nestjs/common';
import { BillingDataContributor } from './billing/billing-data.contributor';
import { BillingModule } from './billing/billing.module';
import {
  PERSONAL_DATA_CONTRIBUTORS,
  type PersonalDataContributors,
} from './common/personal-data';

/**
 * Quien aporta datos a la exportacion del art. 15 (ADR-0011).
 *
 * VIVE EN LA RAIZ por el mismo motivo que el cableado de invitaciones: es el
 * unico sitio que conoce a todos los modulos sin que ninguno tenga que conocer a
 * los demas. `members` compone la exportacion sin saber quien hay en esta lista.
 *
 * OJO CON QUE SE REGISTRA AQUI: clases dedicadas y sin dependencias hacia
 * `members`. Este token esta en el grafo de `MembersService`, asi que lo que se
 * registre arrastra consigo todo lo que necesite; registrar `BillingService`
 * —que depende de `MembersService`— cerraria un ciclo de proveedores con el que
 * Nest se queda colgado en el arranque, sin error. Ver ADR-0010 y ADR-0011.
 *
 * CUANDO LLEGUE EL MODULO DE PROGRESO (peso y medidas, art. 9) tendra que
 * registrarse aqui. Si no lo hace, la exportacion sera incompleta ante una
 * solicitud legal y **nadie recibira ningun error**: es el modo de fallo que
 * este punto de extension reduce, pero no elimina.
 */
@Global()
@Module({
  imports: [BillingModule],
  providers: [
    {
      provide: PERSONAL_DATA_CONTRIBUTORS,
      useFactory: (...contribuidores: PersonalDataContributors) => contribuidores,
      inject: [BillingDataContributor],
    },
  ],
  exports: [PERSONAL_DATA_CONTRIBUTORS],
})
export class PersonalDataModule {}
