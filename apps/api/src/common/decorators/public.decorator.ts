import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'gymlab:isPublic';

/**
 * Marca una ruta como accesible sin sesion.
 *
 * `AuthGuard` esta registrado de forma global: lo seguro es por defecto y hay
 * que pedir explicitamente lo contrario. Si algun dia se olvida un decorador,
 * el resultado es un 401 de mas, no una ruta abierta.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
