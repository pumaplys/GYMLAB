import { Global, Module } from '@nestjs/common';
import { INVITATION_ACCEPTED_HOOK } from './common/invitation-hooks';
import { MemberAccountLink } from './members/member-account-link';
import { MembersModule } from './members/members.module';

/**
 * Conecta el punto de extension de invitaciones con quien lo implementa.
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
 *   invitation-hooks     -> members       (registrar la implementacion)
 *
 * `@Global()` para que `InvitationsService` pueda resolver el token sin importar
 * este modulo, cerrando la ultima via por la que reapareceria el ciclo.
 *
 * OJO CON QUE SE REGISTRA AQUI: `MemberAccountLink`, no `MembersService`. Este
 * modulo esta en el grafo de dependencias de `InvitationsService`, asi que lo que
 * se registre arrastra consigo todo lo que necesite. Apuntar a `MembersService`
 * —que depende de `InvitationsService`— cerraba un ciclo de proveedores con el
 * que Nest se queda colgado, sin error. Ver `members/member-account-link.ts`.
 *
 * CUANDO LLEGUE EL MODULO DE ENTRENADORES tendra que reaccionar tambien —crear
 * su perfil al aceptarse una invitacion—. El sitio donde anadirlo es este, no
 * `invitations`, y con la misma regla: un implementador sin dependencias hacia
 * quien le invoca.
 */
@Global()
@Module({
  imports: [MembersModule],
  providers: [{ provide: INVITATION_ACCEPTED_HOOK, useExisting: MemberAccountLink }],
  exports: [INVITATION_ACCEPTED_HOOK],
})
export class InvitationHooksModule {}
