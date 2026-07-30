import { Module } from '@nestjs/common';
import { InvitationsModule } from '../invitations/invitations.module';
import { MemberAccountLink } from './member-account-link';
import { MembersController, OwnMemberProfileController } from './members.controller';
import { MembersService } from './members.service';

/**
 * `members -> invitations` es la UNICA direccion entre estos dos modulos.
 *
 * Este importa `InvitationsModule` para crear invitaciones de socio. El sentido
 * contrario —rellenar `members.user_id` al aceptarse— va por la interfaz de
 * `common/invitation-hooks.ts`, cableada en la raiz. Asi no hay ciclo (ADR-0006).
 *
 * Que el implementador del hook sea `MemberAccountLink` y no `MembersService` no
 * es cosmetico: con las dos puntas en la misma clase el grafo de PROVEEDORES
 * seguia siendo circular y la aplicacion no arrancaba. Ver `member-account-link.ts`.
 */
@Module({
  imports: [InvitationsModule],
  controllers: [MembersController, OwnMemberProfileController],
  providers: [MembersService, MemberAccountLink],
  exports: [MembersService, MemberAccountLink],
})
export class MembersModule {}
