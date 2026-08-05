import { Global, Module } from '@nestjs/common';
import type { Database } from '@gymlab/db';
import { DATABASE } from '../database/database.module';
import { JobsService } from '../jobs/jobs.service';
import { AuthController } from './auth.controller';
import { createAuth } from './auth.instance';
import { AuthService } from './auth.service';
import { AUTH } from './auth.tokens';
import { AuthThrottle } from './auth.throttle';
import { StaffController } from './staff.controller';

/**
 * Provee la instancia de Better Auth.
 *
 * No registra ningun controlador que monte su router (ADR-0009): los endpoints
 * de autenticacion son nuestros y consumen `auth.api.*`.
 */
@Global()
@Module({
  controllers: [AuthController, StaffController],
  providers: [
    {
      provide: AUTH,
      inject: [DATABASE, JobsService],
      useFactory: (db: Database, jobs: JobsService) => createAuth(db, jobs),
    },
    AuthService,
    AuthThrottle,
  ],
  exports: [AUTH, AuthService],
})
export class AuthModule {}
