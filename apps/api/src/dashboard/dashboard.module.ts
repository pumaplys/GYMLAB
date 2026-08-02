import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { BillingModule } from '../billing/billing.module';
import { MembersModule } from '../members/members.module';
import { TrainersModule } from '../trainers/trainers.module';
import { TrainingModule } from '../training/training.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Depende de los cinco modulos de dominio, y ninguno depende de el.
 *
 * Es el sitio del grafo donde eso es correcto: el panel lee de todo y no le
 * llama nadie, asi que las flechas solo salen. Por eso va el ultimo.
 */
@Module({
  imports: [MembersModule, BillingModule, AccessModule, TrainersModule, TrainingModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
