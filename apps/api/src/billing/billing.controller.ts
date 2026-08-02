import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createPlanSchema,
  createSubscriptionSchema,
  registerPaymentSchema,
  updatePlanSchema,
  voidPaymentSchema,
  type CreatePlanInput,
  type CreateSubscriptionInput,
  type RegisterPaymentInput,
  type UpdatePlanInput,
  type VoidPaymentInput,
} from '@gymlab/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { BillingService } from './billing.service';

/**
 * Planes del gimnasio. Solo el dueno.
 *
 * Recepcion cobra y da de alta cuotas, pero no decide los precios: eso es del
 * negocio, y quien esta en el mostrador no deberia poder cambiarlo entre dos
 * clientes.
 */
@Controller('gyms/:gymId/plans')
@Roles('owner')
export class PlansController {
  constructor(private readonly billing: BillingService) {}

  @Post()
  create(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body(new ZodBody(createPlanSchema)) body: CreatePlanInput,
  ) {
    return this.billing.createPlan(this.gym(gymId), body);
  }

  @Get()
  list(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.billing.listPlans(this.gym(gymId));
  }

  @Patch(':id')
  update(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(updatePlanSchema)) body: UpdatePlanInput,
  ) {
    return this.billing.updatePlan(this.gym(gymId), id, body);
  }

  @Post(':id/archive')
  archive(@Param('gymId', ParseUUIDPipe) gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.archivePlan(this.gym(gymId), id);
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
 * La cuota de un socio y sus pagos. Dueno y recepcion.
 *
 * El entrenador no aparece: saber si alguien esta al corriente de pago no le hace
 * falta para entrenarle, y es dato economico. El QR lo consultara por su cuenta,
 * a traves del servicio y no de estos endpoints.
 */
@Controller('gyms/:gymId/members/:memberId')
@Roles('owner', 'receptionist')
export class MemberBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('subscription')
  getSubscription(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.billing.getSubscription(this.gym(gymId), memberId);
  }

  @Get('dues')
  dues(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.billing.estadoDe(this.gym(gymId), memberId);
  }

  @Post('subscription')
  subscribe(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodBody(createSubscriptionSchema)) body: CreateSubscriptionInput,
  ) {
    return this.billing.subscribe(this.gym(gymId), memberId, body.planId, body.startedOn);
  }

  @Post('subscription/pause')
  pause(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.billing.pause(this.gym(gymId), memberId);
  }

  @Post('subscription/resume')
  resume(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.billing.resume(this.gym(gymId), memberId);
  }

  @Delete('subscription')
  async cancel(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    await this.billing.cancel(this.gym(gymId), memberId);
    return { ok: true };
  }

  @Post('payments')
  registerPayment(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodBody(registerPaymentSchema)) body: RegisterPaymentInput,
  ) {
    return this.billing.registerPayment(this.gym(gymId), memberId, body);
  }

  @Get('payments')
  listPayments(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.billing.listPayments(this.gym(gymId), memberId);
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
 * Anular un pago. **Solo el dueno.**
 *
 * Es la unica via para corregir un cobro mal apuntado, y deja rastro con motivo y
 * autor. Que recepcion pudiera anular sus propios registros vaciaria de sentido
 * el caracter append-only de la tabla.
 */
@Controller('gyms/:gymId/payments')
@Roles('owner')
export class PaymentsController {
  constructor(private readonly billing: BillingService) {}

  @Post(':id/void')
  voidPayment(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(voidPaymentSchema)) body: VoidPaymentInput,
  ) {
    return this.billing.voidPayment(this.gym(gymId), id, body.reason);
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
 * El socio y su propia cuota.
 *
 * Ruta sin `:memberId`, igual que el resto de `/me/...`: se localiza por el
 * `user_id` de la sesion, asi que no hay ningun identificador con el que probar
 * suerte y mirar la cuota de otro.
 */
@Controller('me/dues')
export class OwnDuesController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  async get() {
    const ctx = requireRequestContext();
    if (!ctx.gymId) {
      throw new ForbiddenException('Necesitas un gimnasio activo. Usa /v1/auth/switch-gym.');
    }
    return this.billing.estadoDeUsuario(ctx.gymId, ctx.userId);
  }
}
