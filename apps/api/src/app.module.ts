import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AccessModule } from './access/access.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { InvitationHooksModule } from './invitation-hooks.module';
import { InvitationsModule } from './invitations/invitations.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { MembersModule } from './members/members.module';
import { PersonalDataModule } from './personal-data.module';
import { TrainersModule } from './trainers/trainers.module';
import { ProgressModule } from './progress/progress.module';
import { TrainingModule } from './training/training.module';

/**
 * Modulo raiz del monolito modular.
 *
 * Las cuatro barreras de ADR-0007 se registran aqui, y el orden importa:
 *
 *   middleware  RequestContextMiddleware  abre el AsyncLocalStorage
 *   guard [1]   AuthGuard                 ¿sesion valida?   -> 401
 *   guard [2]   RolesGuard                ¿rol suficiente?  -> 403
 *   interceptor TenantInterceptor         withTenant(gymId)
 *   ...handler...
 *   [4]         PostgreSQL + RLS          ultima barrera, ajena a este codigo
 *
 * Guards e interceptor son GLOBALES a proposito: lo seguro es el defecto.
 * Abrir una ruta exige `@Public()` explicito. Si algun dia se olvida el
 * decorador, el resultado es un 401 de mas, nunca una ruta desprotegida.
 *
 * REGLA DE ORO al anadir modulos de dominio: un modulo nunca importa el
 * repositorio de otro; pide a su servicio de aplicacion.
 */
@Module({
  // Uno por linea: es la lista que crece con cada modulo de dominio, y en una
  // sola linea es donde se produjo el conflicto al integrar dos ramas.
  imports: [
    DatabaseModule,
    MailModule,
    JobsModule,
    AuthModule,
    InvitationsModule,
    MembersModule,
    TrainersModule,
    BillingModule,
    TrainingModule,
    ProgressModule,
    AccessModule,
    // Van DESPUES de los modulos de dominio: registran sus implementaciones de
    // los dos puntos de extension. Ver ADR-0010 y ADR-0011.
    InvitationHooksModule,
    PersonalDataModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // '{*path}' y no '*': NestJS 11 usa path-to-regexp v8, donde el comodin
    // suelto esta obsoleto y solo funciona por conversion automatica heredada.
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
