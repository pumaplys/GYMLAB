import type { Role } from '@gymlab/contracts';
import { rolesQuePuedeInvitar } from './logica';

/**
 * Quien puede que con el personal, las invitaciones y los entrenadores.
 *
 * Copia lo que ya decidio la API. El servidor rechaza por rol cada endpoint y
 * lo hace primero; lo unico que se evita aqui es pintar un boton que da 403.
 */

/** `GET /gyms/:gymId/staff` -> `@Roles('owner', 'receptionist')`. */
export function puedeVerElPersonal(rol: Role): boolean {
  return rol === 'owner' || rol === 'receptionist';
}

/**
 * `DELETE /gyms/:gymId/staff/:userId` -> `@Roles('owner')`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VER LA LISTA NO DA PODER SOBRE ELLA.                                     │
 * │                                                                          │
 * │ Recepcion ve quien trabaja aqui —es operativa diaria y evita reinvitar a │
 * │ quien ya esta— y no puede retirarle el acceso a nadie. Lo dice el propio │
 * │ controlador, con esas palabras.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function puedeRetirarAcceso(rol: Role): boolean {
  return rol === 'owner';
}

/** Las tres de invitaciones: `@Roles('owner', 'receptionist')`. */
export function puedeGestionarInvitaciones(rol: Role): boolean {
  return puedeVerElPersonal(rol);
}

/**
 * Y ademas, A QUIEN. No basta con poder invitar: `canInvite` del contrato
 * decide el rol de destino, y recepcion no puede crear dueños.
 */
export function puedeInvitarConRol(actor: Role, destino: Role): boolean {
  return rolesQuePuedeInvitar(actor).includes(destino);
}

/**
 * Asignar y retirar entrenadores a un socio:
 * `@Roles('owner', 'receptionist')` en `TrainersController`.
 *
 * Es GESTIONAR entrenadores como personal, no usar RINDA siendo entrenador.
 * El entrenador NO entra aqui: su area es `/me/trainer`, y ahi no elige a
 * quien entrena.
 */
export function puedeAsignarEntrenadores(rol: Role): boolean {
  return puedeVerElPersonal(rol);
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE LA API PERMITE Y LA WEB NO OFRECE, Y POR TANTO EL MOVIL TAMPOCO. │
 * │                                                                          │
 * │ `GET /trainers/:id`, `PATCH /trainers/:id`, los dos                      │
 * │ `deactivate`/`reactivate` de un entrenador y `GET /trainers/:id/members` │
 * │ existen en la API. NINGUNA pantalla del panel los usa —comprobado         │
 * │ recorriendo `apps/web` entero—, asi que no forman parte del alcance del  │
 * │ producto. La referencia es la web.                                       │
 * │                                                                          │
 * │ Lo mismo con `GET`/`PATCH /gyms/:gymId/settings`, que ademas es de otra  │
 * │ fase.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const FICHA_DE_ENTRENADOR_NO_ESTA_EN_EL_PRODUCTO = true;
