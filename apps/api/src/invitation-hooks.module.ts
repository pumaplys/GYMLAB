import { Global, Module } from '@nestjs/common';
import { INVITATION_ACCEPTED_HOOK, type InvitationAcceptedHooks } from './common/invitation-hooks';
import { MemberAccountLink } from './members/member-account-link';
import { MembersModule } from './members/members.module';
import { TrainerProfileLink } from './trainers/trainer-profile-link';
import { TrainersModule } from './trainers/trainers.module';

/**
 * Conecta el punto de extension de invitaciones con quienes lo implementan.
 *
 * VIVE AQUI, EN LA RAIZ, Y NO DENTRO DE NINGUN MODULO DE DOMINIO. El motivo es
 * concreto: para inyectar en `InvitationsService` un proveedor declarado por
 * `MembersModule`, `InvitationsModule` tendria que importar `MembersModule` —
 * y `MembersModule` ya importa `InvitationsModule` para crear invitaciones. Un
 * ciclo de modulos que ADR-0006 no permite.
 *
 * Poniendo el cableado en la raiz de la aplicacion, que es quien conoce a todos,
 * el grafo queda aciclico:
 *
 *   members              -> invitations   (crear invitaciones)
 *   invitations          -> common        (la interfaz, sin dependencias)
 *   invitation-hooks     -> members, trainers  (registrar implementaciones)
 *
 * `@Global()` para que `InvitationsService` pueda resolver el token sin importar
 * este modulo, cerrando la ultima via por la que reapareceria el ciclo.
 *
 * OJO CON QUE SE REGISTRA AQUI: clases dedicadas y sin dependencias, nunca los
 * servicios de cada modulo. Este modulo esta en el grafo de dependencias de
 * `InvitationsService`, asi que lo que se registre arrastra consigo todo lo que
 * necesite; apuntar a `MembersService` —que depende de `InvitationsService`—
 * cerraba un ciclo de proveedores con el que Nest se queda colgado, sin error.
 * Ver `members/member-account-link.ts` y ADR-0010.
 */
@Global()
@Module({
  imports: [MembersModule, TrainersModule],
  providers: [
    {
      provide: INVITATION_ACCEPTED_HOOK,
      // Una lista, no un unico implementador: al aceptarse una invitacion puede
      // haber varios modulos que reaccionen —la ficha del socio y el perfil del
      // entrenador— y cada uno decide si le concierne mirando el evento.
      useFactory: (...hooks: InvitationAcceptedHooks) => hooks,
      inject: [MemberAccountLink, TrainerProfileLink],
    },
  ],
  exports: [INVITATION_ACCEPTED_HOOK],
})
export class InvitationHooksModule {}
