import { memberSchema, trainerSchema, type Member, type Trainer } from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * Lo que cada rol puede pedir SOBRE SI MISMO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN `gymId` EN LA RUTA, Y ESA ES LA GRACIA.                              │
 * │                                                                          │
 * │ El resto del cliente lleva `/gyms/:gymId/...` porque asi es la API. Estas │
 * │ no: el servidor resuelve la ficha por el `user_id` de la sesion y el      │
 * │ gimnasio por el activo de la sesion. No hay ningun identificador que      │
 * │ escribir, y por tanto ninguno con el que probar suerte.                   │
 * │                                                                          │
 * │ Es la razon por la que el area de socio no necesita que el frontend le    │
 * │ pase nada: su contexto ES su sesion.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * DE MOMENTO SOLO EL PERFIL DE CADA AREA. Las rutinas, la cuota, el progreso y
 * el QR se anaden cuando llegue la pantalla que los usa: un metodo sin
 * consumidor no se ejecuta nunca y, por tanto, tampoco se sabe si funciona.
 */
export interface YoApi {
  /**
   * El perfil del entrenador que ha iniciado sesion.
   *
   * 403 si el rol del gimnasio activo no es `trainer` — el servidor lo impone
   * con `@Roles('trainer')`, no depende de que el frontend no lo llame.
   */
  perfilDeEntrenador(options?: RequestOptions): Promise<Trainer>;

  /**
   * La ficha del socio que ha iniciado sesion.
   *
   * 404 si esa cuenta no tiene ficha en el gimnasio activo, que es un caso
   * real: alguien puede ser recepcion en un gimnasio y no ser socio de el.
   */
  fichaDeSocio(options?: RequestOptions): Promise<Member>;
}

export function createYoApi(http: Http): YoApi {
  return {
    perfilDeEntrenador: (options) =>
      http({ method: 'GET', path: '/me/trainer', schema: trainerSchema, ...options }),

    fichaDeSocio: (options) =>
      http({ method: 'GET', path: '/me/member-profile', schema: memberSchema, ...options }),
  };
}
