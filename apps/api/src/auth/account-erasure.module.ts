import { Module } from '@nestjs/common';
import { InvitationsModule } from '../invitations/invitations.module';
import { MembersModule } from '../members/members.module';
import { AccountErasureController } from './account-erasure.controller';
import { AccountErasureService } from './account-erasure.service';

/**
 * El borrado de cuenta, en su propio modulo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE NO VA DENTRO DE `AuthModule`.                                    │
 * │                                                                          │
 * │ Necesita `MembersService` —ADR-0006: se le pide al servicio del modulo,  │
 * │ no se le tocan las tablas—, y `AuthModule` es `@Global()`. Un modulo     │
 * │ global que importa a otro arrastra ese grafo a todas partes, y ese es    │
 * │ exactamente el camino por el que Nest se quedo colgado en el arranque    │
 * │ sin ningun error (ADR-0010).                                             │
 * │                                                                          │
 * │ Un modulo aparte lo deja como una hoja: importa hacia abajo y nadie lo   │
 * │ importa a el. Es el mismo remedio que ya se aplico en                    │
 * │ `MemberErasedHooksModule`.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Module({
  imports: [MembersModule, InvitationsModule],
  controllers: [AccountErasureController],
  providers: [AccountErasureService],
})
export class AccountErasureModule {}
