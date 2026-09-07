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
import type { Area, EstadoDeSesion } from '../auth/estado';

export const RUTAS = {
  arranque: null,
  entrar: '/entrar',
  elegirGimnasio: '/elegir-gimnasio',
  noAdmitido: '/no-admitido',
  problema: '/problema',
  inicio: '/inicio',
  panel: '/panel',
  entrenador: '/entrenador',
} as const;

/**
 * Las rutas que viven DENTRO de un area y no son su puerta de entrada.
 *
 * Se escriben aqui, junto a las demas, para que exista un solo sitio donde
 * mirar que rutas hay. El escaner vive DENTRO del grupo `(panel)`, asi que su
 * gate es el layout del grupo y no hace falta ninguno propio: si lo tuviera,
 * serian dos politicas para la misma puerta.
 */
export const RUTAS_INTERNAS = {
  escaner: '/escaner',
  buscar: '/buscar',
  /** La ficha de un socio, vista por el personal. Lleva su id. */
  socioDelPanel: (id: string) => `/socio/${id}`,
  /** La ficha de un socio, vista por su entrenador. Otra ruta y otra area. */
  socioDelEntrenador: (id: string) => `/asignado/${id}`,
} as const;

/**
 * La primera pantalla de cada area. Es a donde se llega tras entrar.
 *
 * `Record<Area, …>` por lo mismo que `AREA_DE_ROL`: un area nueva no compila
 * hasta que se decide su puerta de entrada.
 */
export const INICIO_DE_AREA: Record<Area, string> = {
  socio: RUTAS.inicio,
  panel: RUTAS.panel,
  entrenador: RUTAS.entrenador,
};

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
  | 'volver'
  /* Los dos de STAFF-FINAL: buscar un socio, y los socios de un entrenador. */
  | 'buscar'
  | 'socios';

/**
 * A donde lleva el "Volver" de una seccion de Perfil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ HAY DOS FORMAS DE LLEGAR, Y SOLO UNA TIENE HISTORIAL.                   │
 * │                                                                          │
 * │ Desde la app se llega pulsando una fila de Perfil: hay pila, y volver es │
 * │ deshacer. Con `push` en vez de `back`, cada vuelta apilaria otra         │
 * │ pantalla y el gesto de atras del sistema recorreria un historial que no  │
 * │ se parece a lo que hizo la persona.                                      │
 * │                                                                          │
 * │ Por un enlace directo —una notificacion, un enlace compartido— no hay    │
 * │ nada detras. Ahi `back` no haria nada o sacaria de la app, asi que se    │
 * │ REEMPLAZA por Perfil, que es donde vive esa seccion.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function destinoAlVolver(hayHistorial: boolean): 'atras' | '/perfil' {
  return hayHistorial ? 'atras' : '/perfil';
}

/**
 * Lo mismo, para cualquier pantalla contenedora.
 *
 * La regla es la de arriba y no cambia —con historial se deshace, sin el se
 * reemplaza— pero el sitio al que se cae ya no es siempre Perfil: el Panel y el
 * area del entrenador tienen el suyo. Se generaliza en vez de escribir la misma
 * decision una tercera vez.
 */
export function destinoAlVolverA(hayHistorial: boolean, contenedor: string): 'atras' | string {
  return hayHistorial ? 'atras' : contenedor;
}

/**
 * A donde lleva el "Volver" del escaner.
 *
 * El mismo razonamiento que el de arriba, con otra casa: desde el Panel hay
 * pila y volver es deshacer; por un enlace directo a `rinda://escaner` no hay
 * nada detras, y `back` sacaria de la app a alguien que solo queria cerrar la
 * camara. Ahi se REEMPLAZA por el Panel, que es de donde cuelga el escaner.
 */
export function destinoAlSalirDelEscaner(hayHistorial: boolean): 'atras' | '/panel' {
  return hayHistorial ? 'atras' : '/panel';
}

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
      // El area ya la decidio `resolverAcceso` a partir del rol en el gimnasio
      // activo. Aqui solo se traduce a una ruta.
      return INICIO_DE_AREA[estado.area] as Destino;
  }
}

/**
 * Si este estado puede estar DENTRO de un area concreta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DOS CONDICIONES, Y LAS DOS EN POSITIVO.                                 │
 * │                                                                          │
 * │ Autenticado Y de esta area. Escrito como "todo menos sinSesion", o como  │
 * │ "cualquier area menos la ajena", un estado o un area nuevos entrarian    │
 * │ sin que nadie lo hubiera decidido.                                       │
 * │                                                                          │
 * │ El area NO se vuelve a deducir del rol aqui: se compara con la que ya    │
 * │ calculo `resolverAcceso`. Deducirla dos veces son dos politicas, y dos   │
 * │ politicas acaban separandose.                                            │
 * │                                                                          │
 * │ Y esto NO sustituye a la API: el servidor rechaza por rol cada endpoint  │
 * │ igualmente. Lo que evita este gate es pintar pantallas que la API va a   │
 * │ rechazar enteras — y que un enlace directo meta a alguien donde no va.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function puedeEntrarEnArea(estado: EstadoDeSesion, area: Area): boolean {
  return estado.tipo === 'autenticado' && estado.area === area;
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
