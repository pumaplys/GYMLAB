import { Global, Module } from '@nestjs/common';
import { AccessDataContributor } from './access/access-data.contributor';
import { BillingDataContributor } from './billing/billing-data.contributor';
import { BillingModule } from './billing/billing.module';
import {
  PERSONAL_DATA_CONTRIBUTORS,
  type PersonalDataContributors,
} from './common/personal-data';
import { ProgressDataContributor } from './progress/progress-data.contributor';
import { TrainingDataContributor } from './training/training-data.contributor';

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
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL FALLO QUE ESTE COMENTARIO ANUNCIO, Y QUE OCURRIO.                     │
 * │                                                                          │
 * │ Aqui ponia: "cuando llegue el modulo de progreso (peso y medidas, art.   │
 * │ 9) tendra que registrarse aqui. Si no lo hace, la exportacion sera       │
 * │ incompleta ante una solicitud legal y nadie recibira ningun error".      │
 * │                                                                          │
 * │ El modulo llego y no se registro. La exportacion entregaba ficha, notas  │
 * │ y cobros, y se dejaba fuera los datos de SALUD —los de categoria         │
 * │ especial— ademas de los accesos y las rutinas. Se cumplio la prediccion  │
 * │ entera, silencio incluido.                                               │
 * │                                                                          │
 * │ La leccion no es "acordarse mejor": es que un aviso en un comentario no  │
 * │ es un mecanismo. Por eso ahora hay una prueba que recorre esta lista y   │
 * │ falla si un modulo con datos personales no aparece en ella.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * OJO CON QUE SE REGISTRA AQUI: clases dedicadas y sin dependencias hacia
 * `members`. Este token esta en el grafo de `MembersService`, asi que lo que se
 * registre arrastra consigo todo lo que necesite.
 */
@Global()
@Module({
  imports: [BillingModule],
  providers: [
    AccessDataContributor,
    ProgressDataContributor,
    TrainingDataContributor,
    {
      provide: PERSONAL_DATA_CONTRIBUTORS,
      useFactory: (...contribuidores: PersonalDataContributors) => contribuidores,
      inject: [
        BillingDataContributor,
        ProgressDataContributor,
        AccessDataContributor,
        TrainingDataContributor,
      ],
    },
  ],
  exports: [PERSONAL_DATA_CONTRIBUTORS],
})
export class PersonalDataModule {}
