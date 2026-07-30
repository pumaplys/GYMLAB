import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

/**
 * Exporta `InvitationsService` porque `members` invita a sus socios delegando
 * en el (ADR-0006: se pide al servicio de aplicacion, nunca al repositorio).
 */
@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
