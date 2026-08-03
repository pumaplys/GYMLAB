import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { TrainerProfileLink } from './trainer-profile-link';
import { OwnTrainerController, TrainersController } from './trainers.controller';
import { TrainersService } from './trainers.service';

/**
 * `trainers -> members`, y nada mas.
 *
 * La dependencia se anadio al alinear el modulo con ADR-0006: antes leia la
 * tabla `members` directamente —un JOIN y un SELECT— en lugar de pedirselo a su
 * servicio. Funcionaba y saltaba la frontera.
 *
 * No cierra ciclo: quien implementa por parte de este modulo el punto de
 * extension de invitaciones es `TrainerProfileLink`, que no depende de nada. La
 * regla que costo cara en ADR-0010 sigue viva aqui.
 */
@Module({
  imports: [MembersModule],
  controllers: [TrainersController, OwnTrainerController],
  providers: [TrainersService, TrainerProfileLink],
  exports: [TrainersService, TrainerProfileLink],
})
export class TrainersModule {}
