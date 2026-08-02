import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  grantHealthConsentSchema,
  recordBodyMetricSchema,
  type GrantHealthConsentInput,
  type RecordBodyMetricInput,
} from '@gymlab/contracts';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { ipDe, toHeaders } from '../common/http';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { ProgressService } from './progress.service';

/**
 * Peso y medidas de un socio, para el personal que puede verlos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RECEPCION NO APARECE, y es una decision del diseno del producto escrita   │
 * │ desde la Fase 1: son datos de salud, y quien atiende el mostrador no los  │
 * │ necesita para su trabajo. Minimizacion (art. 5.1.c) aplicada a los roles. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El entrenador entra, pero el servicio comprueba que el socio sea suyo.
 */
@Controller('gyms/:gymId/members/:memberId/progress')
@Roles('owner', 'trainer')
export class MemberProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  history(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.progress.history(this.gym(gymId), memberId);
  }

  @Post()
  record(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodBody(recordBodyMetricSchema)) body: RecordBodyMetricInput,
  ) {
    return this.progress.record(this.gym(gymId), memberId, body);
  }

  @Delete(':id')
  remove(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.progress.remove(this.gym(gymId), memberId, id);
  }

  private gym(gymIdRuta: string): string {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymIdRuta) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return ctx.gymId;
  }
}

/**
 * El consentimiento de datos de salud.
 *
 * Lo recoge el personal —en el mostrador, con el socio delante— porque un socio
 * sin cuenta tambien tiene derecho a que le registren el peso, y es justo quien
 * no puede aceptarlo desde ninguna app.
 */
@Controller('gyms/:gymId/members/:memberId/health-consent')
@Roles('owner', 'trainer')
export class HealthConsentController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  status(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.progress.healthConsentStatus(this.gym(gymId), memberId);
  }

  /**
   * 200 y no 201: la operacion es IDEMPOTENTE.
   *
   * Aceptar dos veces la misma version no crea una segunda fila, asi que
   * prometer "creado" seria mentir la mitad de las veces.
   */
  @HttpCode(200)
  @Post()
  grant(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodBody(grantHealthConsentSchema)) body: GrantHealthConsentInput,
    @Req() req: Request,
  ) {
    // La IP queda como prueba de la aceptacion, igual que en los eventos de
    // autenticacion. No identifica por si sola, pero situa el acto.
    return this.progress.grantHealthConsent(
      this.gym(gymId),
      memberId,
      body,
      ipDe(toHeaders(req)),
    );
  }

  @Delete()
  revoke(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.progress.revokeHealthConsent(this.gym(gymId), memberId);
  }

  private gym(gymIdRuta: string): string {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymIdRuta) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return ctx.gymId;
  }
}

/**
 * El socio y sus propios datos de progreso.
 *
 * Sin `:memberId`: se localiza por el `user_id` de la sesion. Registrar el propio
 * peso desde la app tambien pasa por la puerta del consentimiento — que uno mismo
 * meta el dato no cambia que sea categoria especial.
 */
@Controller('me/progress')
export class OwnProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  history() {
    return this.progress.myHistory(this.gymActivo(), requireRequestContext().userId);
  }

  @Post()
  record(@Body(new ZodBody(recordBodyMetricSchema)) body: RecordBodyMetricInput) {
    return this.progress.recordMine(this.gymActivo(), requireRequestContext().userId, body);
  }

  private gymActivo(): string {
    const ctx = requireRequestContext();
    if (!ctx.gymId) {
      throw new ForbiddenException('Necesitas un gimnasio activo. Usa /v1/auth/switch-gym.');
    }
    return ctx.gymId;
  }
}
