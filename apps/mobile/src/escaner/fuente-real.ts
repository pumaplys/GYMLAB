import type { AccessResult } from '@gymlab/contracts';
import { api } from '../api/cliente';

/**
 * La unica llamada del escaner.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ENDPOINT YA EXISTIA Y EL CLIENTE TAMBIEN. NO SE AÑADE NADA.          │
 * │                                                                          │
 * │   POST /v1/gyms/:gymId/access/verify   { token }  ->  AccessResult       │
 * │                                                                          │
 * │ Es el mismo que usa el mostrador web desde el modulo de acceso, con el   │
 * │ mismo `@gymlab/api-client`. La API lo protege con `@Roles('owner',       │
 * │ 'receptionist')` y ademas exige que el gimnasio de la ruta sea el activo │
 * │ de la sesion, asi que el gate de esta app NO es lo unico que hay.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function verificarCarneReal(gymId: string, token: string): Promise<AccessResult> {
  return api.accesos.verify(gymId, token);
}
