/**
 * Token de inyeccion de la instancia de Better Auth.
 *
 * Vive en su propio archivo para que `AuthGuard` pueda importarlo sin arrastrar
 * `auth.instance.ts`, que a su vez importa la configuracion de entorno. Evita
 * un ciclo de importaciones.
 */
export const AUTH = Symbol('AUTH');
