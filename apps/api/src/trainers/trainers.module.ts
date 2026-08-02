import { Module } from '@nestjs/common';
import { TrainerProfileLink } from './trainer-profile-link';
import { OwnTrainerController, TrainersController } from './trainers.controller';
import { TrainersService } from './trainers.service';

/**
 * Modulo sin dependencias hacia otros modulos de dominio.
 *
 * De `members` solo usa `memberToDto`, que es una funcion pura: no hay
 * inyeccion, asi que no aparece en el grafo del contenedor y no puede formar un
 * ciclo. La regla que costo cara en ADR-0010 sigue viva aqui.
 */
@Module({
  controllers: [TrainersController, OwnTrainerController],
  providers: [TrainersService, TrainerProfileLink],
  exports: [TrainersService, TrainerProfileLink],
})
export class TrainersModule {}
