import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { dashboardQuerySchema, type DashboardQuery } from '@gymlab/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { ZodQuery } from '../common/zod.pipe';
import { DashboardService } from './dashboard.service';

/**
 * El panel. **Solo el dueno.**
 *
 * Recepcion y entrenadores quedan fuera: aqui hay ingresos del mes y el recuento
 * de cuotas vencidas, que es informacion del negocio y no de su trabajo. Cada uno
 * tiene ya la pantalla que necesita —recepcion la ficha del socio, el entrenador
 * sus asignados—, y agregar todo en una sola vista no lo convierte en algo que
 * deban ver.
 */
@Controller('gyms/:gymId/dashboard')
@Roles('owner')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  resumen(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Query(new ZodQuery(dashboardQuerySchema)) query: DashboardQuery,
  ) {
    const ctx = requireRequestContext();
    if (ctx.gymId !== gymId) {
      throw new ForbiddenException('El gimnasio de la ruta no es el activo de tu sesion.');
    }
    return this.dashboard.resumen(ctx.gymId, query.dias);
  }
}
