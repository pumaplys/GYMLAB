import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
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
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { forwardAuthCookies, toHeaders } from '../common/http';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { AuthService } from './auth.service';

/**
 * Endpoints de autenticacion.
 *
 * Escritos a mano en lugar de montar el router de Better Auth (ADR-0009): asi
 * la superficie expuesta es exactamente esta lista, y una actualizacion de la
 * libreria no puede anadir rutas sin que nos enteremos.
 *
 * Los flujos que abren o cierran sesion trasladan las cookies de Better Auth a
 * la respuesta (transporte del panel web) y ademas devuelven el token en el
 * cuerpo (transporte de la app movil, que no tiene cookies). Una sola sesion
 * detras de los dos.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register-gym')
  async registerGym(
    @Body(new ZodBody(registerGymSchema)) body: RegisterGymInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, authHeaders } = await this.auth.registerGym(body, toHeaders(req));
    forwardAuthCookies(authHeaders, res);
    return session;
  }

  @Public()
  @Post('login')
  async login(
    @Body(new ZodBody(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, authHeaders } = await this.auth.login(body, toHeaders(req));
    forwardAuthCookies(authHeaders, res);
    return session;
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { authHeaders } = await this.auth.logout(toHeaders(req), requireRequestContext().userId);
    forwardAuthCookies(authHeaders, res);
    return { ok: true };
  }

  @Get('me')
  me() {
    const ctx = requireRequestContext();
    return this.auth.me(ctx.userId, ctx.gymId);
  }

  @Post('switch-gym')
  switchGym(@Body(new ZodBody(switchGymSchema)) body: SwitchGymInput) {
    // La sesion se identifica por el id que AuthGuard ya resolvio, no leyendo
    // el token de la peticion: el cliente no elige sobre que sesion se opera.
    const ctx = requireRequestContext();
    return this.auth.switchGym(ctx.userId, ctx.sessionId, body.gymId);
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
