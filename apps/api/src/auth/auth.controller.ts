import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  forgotPasswordSchema,
  loginSchema,
  registerGymSchema,
  resetPasswordSchema,
  switchGymSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterGymInput,
  type ResetPasswordInput,
  type SwitchGymInput,
  type VerifyEmailInput,
} from '@gymlab/contracts';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { extractSessionToken, toHeaders } from '../common/http';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { AuthService } from './auth.service';

/**
 * Endpoints de autenticacion.
 *
 * Escritos a mano en lugar de montar el router de Better Auth (ADR-0009): asi
 * la superficie expuesta es exactamente esta lista, y una actualizacion de la
 * libreria no puede anadir rutas sin que nos enteremos.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register-gym')
  registerGym(@Body(new ZodBody(registerGymSchema)) body: RegisterGymInput, @Req() req: Request) {
    return this.auth.registerGym(body, toHeaders(req));
  }

  @Public()
  @Post('login')
  login(@Body(new ZodBody(loginSchema)) body: LoginInput, @Req() req: Request) {
    return this.auth.login(body, toHeaders(req));
  }

  @Post('logout')
  logout(@Req() req: Request) {
    return this.auth.logout(toHeaders(req), requireRequestContext().userId);
  }

  @Get('me')
  me() {
    const ctx = requireRequestContext();
    return this.auth.me(ctx.userId, ctx.gymId);
  }

  @Post('switch-gym')
  switchGym(@Body(new ZodBody(switchGymSchema)) body: SwitchGymInput, @Req() req: Request) {
    const ctx = requireRequestContext();
    return this.auth.switchGym(ctx.userId, extractSessionToken(req), body.gymId);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodBody(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    return this.auth.forgotPassword(body, toHeaders(req));
  }

  @Public()
  @Post('reset-password')
  resetPassword(
    @Body(new ZodBody(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
  ) {
    return this.auth.resetPassword(body, toHeaders(req));
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body(new ZodBody(verifyEmailSchema)) body: VerifyEmailInput, @Req() req: Request) {
    return this.auth.verifyEmail(body, toHeaders(req));
  }
}
