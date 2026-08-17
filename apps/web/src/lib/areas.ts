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
    ruta === '/configuracion'
  ) {
    return 'panel';
  }
  return null;
}

export function inicioPara(rol: Role): string {
  return INICIO_DE_AREA[AREA_DE_ROL[rol]];
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
  if (area === AREA_DE_ROL[rol]) return null;
  return inicioPara(rol);
}
