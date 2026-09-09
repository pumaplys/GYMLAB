import type { Role } from '@gymlab/contracts';

/**
 * Las tres experiencias que conviven en la misma aplicacion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL AREA SALE DEL ROL DE LA PERTENENCIA ACTIVA, NUNCA DE LA CUENTA.       │
 * │                                                                          │
 * │ Una misma persona puede ser entrenadora en un gimnasio y socia en otro:  │
 * │ la auditoria lo confirmo en el codigo y hay una prueba de backend que lo │
 * │ cubre. Asi que "el rol del usuario" no existe — existe su rol AQUI, en   │
 * │ el gimnasio activo de la sesion.                                         │
 * │                                                                          │
 * │ Consecuencia practica: cambiar de gimnasio puede cambiar de aplicacion.  │
 * │ Todo lo que decida a donde va alguien pasa por este fichero, y este      │
 * │ fichero solo recibe un rol. No hay forma de escribir `if (usuario.rol)`  │
 * │ porque no se le pasa el usuario.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type Area = 'panel' | 'entrenador' | 'socio';

/**
 * `Record<Role, Area>` obliga a que un rol nuevo del contrato pase por aqui: si
 * se anadiera uno, esto deja de compilar en lugar de dejar a esa gente sin
 * ningun sitio al que ir.
 */
export const AREA_DE_ROL: Record<Role, Area> = {
  owner: 'panel',
  receptionist: 'panel',
  trainer: 'entrenador',
  member: 'socio',
};

/** La primera pantalla de cada area. Es a donde se llega tras entrar. */
export const INICIO_DE_AREA: Record<Area, string> = {
  panel: '/socios',
  entrenador: '/entrenador',
  socio: '/socio',
};

/**
 * A que area pertenece una ruta.
 *
 * Se decide por prefijo y no por una lista de rutas, para que anadir una
 * pantalla dentro de un area no obligue a tocar esto. `null` para las que no
 * son de ningun area —entrar, recuperar contrasena, aceptar invitacion—, que no
 * exigen sesion y por tanto tampoco rol.
 */
export function areaDeRuta(ruta: string): Area | null {
  if (ruta === '/entrenador' || ruta.startsWith('/entrenador/')) return 'entrenador';
  if (ruta === '/socio' || ruta.startsWith('/socio/')) return 'socio';
  if (
    ruta === '/socios' ||
    ruta.startsWith('/socios/') ||
    ruta === '/personal' ||
    ruta === '/planes' ||
    ruta === '/configuracion' ||
    ruta === '/accesos'
  ) {
    return 'panel';
  }
  return null;
}

export function inicioPara(rol: Role): string {
  return INICIO_DE_AREA[AREA_DE_ROL[rol]];
}

/**
 * Entrenamiento: las rutas que NO son de un area, sino de dos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL AREA NO PODIA EXPRESAR ESTO, Y POR ESO FALTABA.                       │
 * │                                                                          │
 * │ `AREA_DE_ROL` da un area a cada rol, y eso basta mientras cada capacidad │
 * │ sea de un area. Ejercicios y rutinas NO lo son: el servidor las autoriza │
 * │ a `owner` Y a `trainer` —`@Roles('owner','trainer')` en las cuatro       │
 * │ clases de `training.controller.ts`— y viven bajo `/entrenador/*` solo    │
 * │ porque es donde se escribieron primero.                                  │
 * │                                                                          │
 * │ Resultado: el dueño quedaba fuera de una capacidad que la API le da, y   │
 * │ nadie lo veia porque el conteo de metodos salia igual —las usa el        │
 * │ entrenador en las dos aplicaciones—. Lo encontro PARITY-5 comparando por │
 * │ ROL en vez de por metodo.                                                │
 * │                                                                          │
 * │ NO se abre el area entera: «Mis socios» y la ficha del socio asignado    │
 * │ cuelgan de `/me/trainer/*`, que es `@Roles('trainer')`. El dueño ahi no  │
 * │ entra, y el servidor tampoco le dejaria.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const RUTAS_DE_ENTRENAMIENTO = ['/entrenador/rutinas', '/entrenador/ejercicios'] as const;

/** Los roles que el servidor autoriza en esas rutas. Ni uno mas. */
export const ROLES_DE_ENTRENAMIENTO: readonly Role[] = ['owner', 'trainer'];

export function esRutaDeEntrenamiento(ruta: string): boolean {
  return RUTAS_DE_ENTRENAMIENTO.some((r) => ruta === r || ruta.startsWith(`${r}/`));
}

/**
 * Que hacer cuando alguien abre una ruta.
 *
 * Devuelve `null` si puede pasar, o la ruta a la que hay que mandarle. Es una
 * funcion pura a proposito: la decision se puede probar sin navegador, sin
 * sesion y sin React, que es lo que permite cubrir a mano los casos raros —
 * entrenador escribiendo la URL del panel, socio escribiendo la del entrenador.
 *
 * ESTO NO ES SEGURIDAD, igual que el resto de `RutaPrivada`: el panel se sirve
 * estatico y cualquiera puede saltarselo. Lo que impide leer datos ajenos son
 * las cuatro barreras del servidor. Aqui solo se evita una experiencia absurda.
 */
export function destinoSegunArea(rol: Role, ruta: string): string | null {
  const area = areaDeRuta(ruta);
  // Ruta sin area: no hay nada que comprobar.
  if (area === null) return null;
  /*
   * Entrenamiento va ANTES que el area: es de los dos roles que autoriza el
   * servidor, no del area de ninguno. Ponerlo despues no serviria de nada —el
   * area ya habria decidido— y ponerlo sin la lista de roles abriria estas
   * rutas a recepcion, que la API rechaza.
   */
  if (esRutaDeEntrenamiento(ruta) && ROLES_DE_ENTRENAMIENTO.includes(rol)) return null;
  if (area === AREA_DE_ROL[rol]) return null;
  return inicioPara(rol);
}
