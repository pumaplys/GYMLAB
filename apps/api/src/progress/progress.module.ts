import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { TrainersModule } from '../trainers/trainers.module';
import { ConsentDocumentsService } from './consent-documents.service';
import { ConsentGate } from './consent.gate';
import {
  HealthConsentController,
  MemberProgressController,
  OwnHealthConsentController,
  OwnProgressController,
} from './progress.controller';
import { ProgressService } from './progress.service';

/**
 * `progress -> members` y `progress -> trainers`, solo en esa direccion.
 *
 * `ConsentGate` no depende de ninguno de los dos: lee `consents` con la
 * transaccion de la peticion y nada mas. Es deliberado — asi puede usarlo
 * cualquier modulo futuro que trate datos de salud sin arrastrar dependencias, y
 * sin poder cerrar un ciclo con quien lo llame.
 */
@Module({
  imports: [MembersModule, TrainersModule],
  controllers: [
    MemberProgressController,
    HealthConsentController,
    OwnHealthConsentController,
    OwnProgressController,
  ],
  providers: [ProgressService, ConsentGate, ConsentDocumentsService],
  exports: [ProgressService, ConsentGate],
})
export class ProgressModule {}
