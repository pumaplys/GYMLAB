import { Global, Module } from '@nestjs/common';
import type { Database } from '@gymlab/db';
import { DATABASE } from '../database/database.module';
import { AuthController } from './auth.controller';
import { createAuth } from './auth.instance';
import { AuthService } from './auth.service';
import { AUTH } from './auth.tokens';

/**
 * Provee la instancia de Better Auth.
 *
 * No registra ningun controlador que monte su router (ADR-0009): los endpoints
 * de autenticacion son nuestros y consumen `auth.api.*`.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH,
      inject: [DATABASE],
      useFactory: (db: Database) => createAuth(db),
    },
    AuthService,
  ],
  exports: [AUTH, AuthService],
})
export class AuthModule {}
