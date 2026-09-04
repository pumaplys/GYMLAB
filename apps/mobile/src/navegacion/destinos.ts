/**
 * A donde va cada estado de sesion, y cuales son los cinco destinos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN REACT Y SIN REACT NATIVE, A PROPOSITO.                              │
 * │                                                                          │
 * │ Es la decision que hay que poder probar —y la que es facil equivocar— y  │
 * │ no necesita un componente montado para comprobarse. `app/index.tsx` y    │
 * │ `app/(tabs)/_layout.tsx` solo la consultan.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { EstadoDeSesion } from '../auth/estado';

export const RUTAS = {
  arranque: null,
  entrar: '/entrar',
  elegirGimnasio: '/elegir-gimnasio',
  noAdmitido: '/no-admitido',
  problema: '/problema',
  inicio: '/inicio',
} as const;

/** `null` significa "quedate donde estas": la pantalla de arranque. */
export type Destino = (typeof RUTAS)[keyof typeof RUTAS];

/**
 * Los iconos que existen. Los cinco de la barra mas los que piden las
 * pantallas:  lo usa Inicio en sus filas.
 */
export type NombreDeIcono =
  | 'inicio'
  | 'rutina'
  | 'carne'
  | 'progreso'
  | 'perfil'
  | 'avanzar'
  /*
   * Los cuatro de M8. Mismo lenguaje que los de M3: viewBox 24, trazo 1,5 y
   * remates redondos. Se dibujan aqui por lo mismo que entonces — cuatro SVG
   * pequeños no justifican una libreria de iconos.
   */
  | 'pagos'
  | 'accesos'
  | 'privacidad'
  | 'salir'
  | 'volver';

export interface DestinoDeTab {
  /** El nombre del fichero dentro de `app/(tabs)`, sin extension. */
  nombre: string;
  etiqueta: string;
  icono: NombreDeIcono;
}

/**
 * Los cinco destinos de la app del socio, en su orden.
 *
 * El Carne va en el CENTRO porque es lo que se abre de pie delante de un
 * torno, con una mano: es la posicion mas facil de acertar sin mirar.
 *
 * Pagos, Accesos y Privacidad NO estan aqui: son secciones dentro de Perfil.
 * Ver la cabecera de `app/(tabs)/perfil.tsx`.
 */
export const DESTINOS_DE_TABS: readonly DestinoDeTab[] = [
  { nombre: 'inicio', etiqueta: 'Inicio', icono: 'inicio' },
  { nombre: 'rutina', etiqueta: 'Rutina', icono: 'rutina' },
  { nombre: 'carne', etiqueta: 'Carné', icono: 'carne' },
  { nombre: 'progreso', etiqueta: 'Progreso', icono: 'progreso' },
  { nombre: 'perfil', etiqueta: 'Perfil', icono: 'perfil' },
];

/**
 * La puerta. UN solo sitio decide a donde va cada estado.
 *
 * Escrito con un `switch` exhaustivo sobre el tipo: si mañana se añade un
 * estado de sesion, esto deja de compilar en lugar de mandar a alguien a
 * ninguna parte.
 */
export function destinoDe(estado: EstadoDeSesion): Destino {
  switch (estado.tipo) {
    case 'cargando':
      return RUTAS.arranque;
    case 'sinSesion':
      return RUTAS.entrar;
    case 'requiereSeleccionGimnasio':
      return RUTAS.elegirGimnasio;
    case 'rolNoAdmitido':
      return RUTAS.noAdmitido;
    case 'errorAlComprobar':
      return RUTAS.problema;
    case 'autenticado':
      return RUTAS.inicio;
  }
}

/**
 * Si este estado puede estar dentro de las pestañas.
 *
 * Se comprueba en POSITIVO y contra un solo tipo. Escrito como "todo menos
 * sinSesion", cualquier estado nuevo entraria sin que nadie lo decidiera.
 *
 * NO mira el rol ni las membresias: para llegar a `autenticado` hay que haber
 * pasado por `resolverAcceso`, que ya exige ser socio en el gimnasio activo.
 * Volver a comprobarlo aqui seria una segunda politica que puede desviarse de
 * la primera.
 */
export function puedeEntrarEnTabs(estado: EstadoDeSesion): boolean {
  return estado.tipo === 'autenticado';
}

/**
 * La ruta de cada destino.
 *
 * Escritas y no derivadas para que TypeScript sepa que existen —una tabla
 * derivada devuelve `string | undefined` en cada lectura—. Lo que impide que
 * se desvien es un test: comprueba que las claves son EXACTAMENTE los cinco
 * destinos y que cada ruta es su nombre de fichero. Si alguien renombra una
 * pantalla, salta ahi.
 */
export const RUTAS_DE_TABS = {
  inicio: '/inicio',
  rutina: '/rutina',
  carne: '/carne',
  progreso: '/progreso',
  perfil: '/perfil',
} as const;
