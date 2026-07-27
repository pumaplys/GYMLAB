import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  type AcceptInvitationInput,
  type CreateInvitationInput,
} from '@gymlab/contracts';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { toHeaders } from '../common/http';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { InvitationsService } from './invitations.service';

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /**
   * El `gymId` va en la ruta por claridad de la API, pero **el que manda es el
   * de la sesion**. Si no coinciden, se rechaza.
   *
   * Sin esta comprobacion, un recepcionista del gimnasio A podria invitar gente
   * al gimnasio B escribiendo otro id en la URL. RLS lo frenaria despues —el
   * INSERT no cumpliria `WITH CHECK`— pero devolveria un error de base de datos
   * en lugar de un 403, y descansar en eso es exactamente lo que ADR-0007
   * queria evitar.
   */
  @Roles('owner', 'receptionist')
  @Post('gyms/:gymId/invitations')
  create(
    @Param('gymId') gymId: string,
    @Body(new ZodBody(createInvitationSchema)) body: CreateInvitationInput,
  ) {
    const ctx = this.assertGymMatches(gymId);
    return this.invitations.create(ctx.gymId!, ctx.userId, ctx.role!, body.email, body.role);
  }

  @Roles('owner', 'receptionist')
  @Get('gyms/:gymId/invitations')
  list(@Param('gymId') gymId: string) {
    return this.invitations.list(this.assertGymMatches(gymId).gymId!);
  }

  @Roles('owner', 'receptionist')
  @Delete('gyms/:gymId/invitations/:id')
  async revoke(@Param('gymId') gymId: string, @Param('id') id: string) {
    const ctx = this.assertGymMatches(gymId);
    await this.invitations.revoke(ctx.gymId!, ctx.userId, id);
    return { ok: true };
  }

  /** Publico: quien acepta todavia no tiene sesion. */
  @Public()
  @Post('auth/accept-invitation')
  accept(
    @Body(new ZodBody(acceptInvitationSchema)) body: AcceptInvitationInput,
    @Req() req: Request,
  ) {
    return this.invitations.accept(body, toHeaders(req));
  }

  private assertGymMatches(gymId: string) {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymId) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return ctx;
  }
}
