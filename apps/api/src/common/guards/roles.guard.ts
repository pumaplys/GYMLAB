import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@gymlab/db';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { REQUIRED_ROLES } from '../decorators/roles.decorator';
import { getRequestContext } from '../request-context';

/**
 * Barrera 2 de las cuatro (ADR-0007): ¿el rol alcanza este endpoint?
 *
 * Se apoya en lo que `AuthGuard` ya dejo en el contexto. No vuelve a consultar
 * la base de datos ni acepta nada del cliente.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<MembershipRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const ctx = getRequestContext();

    if (!ctx?.gymId) {
      throw new ForbiddenException(
        'Esta operacion necesita un gimnasio activo. Usa /v1/auth/switch-gym.',
      );
    }

    if (!ctx.role || !required.includes(ctx.role)) {
      throw new ForbiddenException('Tu rol no permite esta operacion.');
    }

    return true;
  }
}
