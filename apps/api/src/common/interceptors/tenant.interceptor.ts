import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { withTenant, type Database } from '@gymlab/db';
import { Observable, from, lastValueFrom } from 'rxjs';
import { DATABASE } from '../../database/database.module';
import { getRequestContext, patchRequestContext } from '../request-context';

/**
 * Barrera 3 de las cuatro (ADR-0007): fija el contexto de tenant.
 *
 * Implementa ADR-0008: **una transaccion por peticion**. Todo el trabajo de
 * negocio del handler comparte el mismo `SET LOCAL app.gym_id` y la misma
 * atomicidad — la invitacion y su registro de auditoria commitean juntas o no
 * commitea ninguna.
 *
 * Y de ahi sale gratis el patron transactional outbox: cuando entre pg-boss,
 * que guarda los trabajos en Postgres, encolar dentro de esta transaccion hace
 * que el email solo exista si los datos se guardaron.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ REGLA QUE HACE SEGURA ESTA DECISION (ADR-0008):                      │
 * │ ningun handler puede hacer I/O externo sincrono — ni emails, ni      │
 * │ Stripe, ni APIs de terceros. Mantendria la transaccion abierta y,    │
 * │ con carga, agotaria el pool de conexiones. El modo de fallo es una   │
 * │ caida en produccion, no un error visible en desarrollo.              │
 * └──────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = getRequestContext();

    // Rutas publicas, y usuarios que todavia no han elegido gimnasio. Sin
    // contexto de tenant no se abre transaccion: si el handler intentara tocar
    // una tabla con RLS, `requireTransaction()` lanzara un error claro en lugar
    // de devolver cero filas en silencio.
    if (!ctx?.gymId) {
      return next.handle();
    }

    return from(
      withTenant(this.db, ctx.gymId, async (tx) => {
        patchRequestContext({ tx });
        return lastValueFrom(next.handle());
      }),
    );
  }
}
