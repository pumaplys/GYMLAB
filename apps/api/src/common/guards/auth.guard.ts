import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
// Los operadores vienen de @gymlab/db, nunca de drizzle-orm directamente.
// Ver el comentario en packages/db/src/index.ts.
import { and, eq, memberships, withTenant, type Database } from '@gymlab/db';
import type { Request } from 'express';
import { AUTH } from '../../auth/auth.tokens';
import type { Auth } from '../../auth/auth.instance';
import { DATABASE } from '../../database/database.module';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { patchRequestContext } from '../request-context';

/**
 * Barrera 1 de las cuatro (ADR-0007): ¿hay una sesion valida?
 *
 * Registrado globalmente: toda ruta exige sesion salvo que lleve `@Public()`.
 * Lo seguro es el defecto; olvidar un decorador da un 401 de mas, nunca una
 * ruta abierta.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.auth.api.getSession({ headers: toHeaders(request) });

    if (!session?.session || !session.user) {
      throw new UnauthorizedException('Sesion no valida o caducada.');
    }

    // El gimnasio activo sale de la fila de sesion, del lado del servidor.
    // Nunca de una cabecera ni del cuerpo de la peticion (ADR-0007).
    const gymId = (session.session as { activeGymId?: string | null }).activeGymId ?? null;

    patchRequestContext({
      userId: session.user.id,
      sessionId: session.session.id,
      gymId,
      role: gymId ? await this.resolveRole(gymId, session.user.id) : null,
      isPlatformAdmin: (session.user as { isPlatformAdmin?: boolean }).isPlatformAdmin ?? false,
    });

    return true;
  }

  /**
   * Lee el rol del usuario en el gimnasio activo.
   *
   * COSTE ASUMIDO: abre su propia transaccion, distinta de la que abrira despues
   * `TenantInterceptor`. Son dos transacciones cortas por peticion autenticada.
   *
   * El motivo es un orden que no podemos cambiar: en NestJS los guards se
   * ejecutan antes que los interceptores, `RolesGuard` necesita el rol, y
   * `memberships` tiene RLS — leerla sin contexto de tenant devolveria cero
   * filas. Asi que hay que abrir contexto aqui.
   *
   * La alternativa seria desnormalizar el rol en la fila de sesion, pero
   * entonces quitarle permisos a alguien no tendria efecto hasta que volviera a
   * entrar. Preferimos pagar una consulta indexada que tener permisos rancios.
   */
  private async resolveRole(gymId: string, userId: string) {
    const filas = await withTenant(this.db, gymId, (tx) =>
      tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.gymId, gymId), eq(memberships.userId, userId)))
        .limit(1),
    );

    // Sin pertenencia no hay gimnasio activo valido: puede que se la hayan
    // retirado mientras la sesion seguia viva.
    if (!filas[0]) {
      throw new UnauthorizedException('No perteneces al gimnasio activo de esta sesion.');
    }
    return filas[0].role;
  }
}

/** Convierte las cabeceras de Express al `Headers` estandar que espera Better Auth. */
function toHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [clave, valor] of Object.entries(request.headers)) {
    if (typeof valor === 'string') headers.set(clave, valor);
    else if (Array.isArray(valor)) headers.set(clave, valor.join(', '));
  }
  return headers;
}
