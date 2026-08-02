import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { TrainersModule } from '../trainers/trainers.module';
import {
  ExercisesController,
  MemberRoutinesController,
  OwnRoutinesController,
  RoutinesController,
} from './training.controller';
import { TrainingService } from './training.service';

/**
 * `training -> members` y `training -> trainers`, solo en esa direccion.
 *
 * De `trainers` usa una cosa concreta y a proposito: `myMember()`, que responde
 * 404 si el socio no esta entre los asignados de ese entrenador. Reutilizar ese
 * filtro en lugar de reescribirlo aqui evita el fallo clasico —dos copias de una
 * regla de autorizacion que divergen, y la que se olvide sera la insegura.
 *
 * Ninguno de los dos llama de vuelta, asi que no hay ciclo ni punto de extension
 * que cablear.
 */
@Module({
  imports: [MembersModule, TrainersModule],
  controllers: [
    ExercisesController,
    RoutinesController,
    MemberRoutinesController,
    OwnRoutinesController,
  ],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
