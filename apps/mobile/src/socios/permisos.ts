import type { Role } from '@gymlab/contracts';

/**
 * Quien puede que con socios, cuotas, cobros y planes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO DECIDE NADA: COPIA LO QUE YA DECIDIO LA API.                     │
 * │                                                                          │
 * │ El servidor rechaza por rol cada endpoint, y lo hace primero. Lo unico   │
 * │ que se evita aqui es PINTAR un boton que va a dar 403 — que es la forma  │
 * │ mas rapida de que alguien crea que la app esta rota.                     │
 * │                                                                          │
 * │ Cada regla lleva escrito de donde sale. Si el servidor cambia y esto no, │
 * │ lo que se ve es un boton que falla, no un permiso de mas.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * El mostrador: socios y cobros.
 *
 * `@Roles('owner', 'receptionist')` en `MembersController`, en las cuotas y en
 * los pagos de un socio. El entrenador NO entra: no cobra ni da de alta.
 */
export function puedeAtenderMostrador(rol: Role): boolean {
  return rol === 'owner' || rol === 'receptionist';
}

/**
 * Lo que solo firma el DUEÑO, y los tres tienen la misma razon de fondo: son
 * irreversibles o tocan el historial economico.
 *
 *   `GET  /members/:id/export`   @Roles('owner')  se lleva los datos fuera
 *   `DELETE /members/:id`        @Roles('owner')  borra para siempre
 *   `POST /payments/:id/void`    @Roles('owner')  reescribe la caja
 *
 * Recepcion atiende el mostrador todos los dias; estas tres no son de todos
 * los dias.
 */
export function puedeExportarDatos(rol: Role): boolean {
  return rol === 'owner';
}

export function puedeEliminarSocio(rol: Role): boolean {
  return rol === 'owner';
}

export function puedeAnularPagos(rol: Role): boolean {
  return rol === 'owner';
}

/**
 * Los planes: VER es de los dos, CAMBIARLOS es del dueño.
 *
 * `PlansController` tiene `@Roles('owner')` en la clase y baja a
 * `@Roles('owner', 'receptionist')` solo en el `GET`. Tiene sentido: recepcion
 * necesita la lista para dar de alta una cuota, no para cambiar los precios.
 */
export function puedeVerPlanes(rol: Role): boolean {
  return puedeAtenderMostrador(rol);
}

export function puedeEditarPlanes(rol: Role): boolean {
  return rol === 'owner';
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS NOTAS INTERNAS NO ENTRAN, Y NO ES UN RECORTE MOVIL.                 │
 * │                                                                          │
 * │ `POST/GET /members/:id/notes` existen en la API, pero NINGUNA pantalla   │
 * │ del panel web las usa —comprobado recorriendo `apps/web` entero—. La     │
 * │ referencia de alcance del producto es la web, asi que aqui tampoco.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const NOTAS_NO_ESTAN_EN_EL_PRODUCTO = true;
