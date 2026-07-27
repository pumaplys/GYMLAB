import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@gymlab/db';

export const REQUIRED_ROLES = 'gymlab:roles';

/**
 * Restringe una ruta a determinados roles dentro del gimnasio activo.
 *
 * Sin decorador, basta con estar autenticado y tener un gimnasio activo.
 *
 * @example
 * ＠Roles('owner', 'receptionist')
 */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(REQUIRED_ROLES, roles);
