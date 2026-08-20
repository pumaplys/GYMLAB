import type { NombreDeIcono } from '@/componentes/iconos';

/**
 * Un destino de navegacion. El icono acompaña al texto; nunca lo sustituye.
 */
export interface Destino {
  href: string;
  texto: string;
  icono: NombreDeIcono;
}

/**
 * Cual de los destinos corresponde a la ruta actual.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ GANA EL PREFIJO MAS LARGO, Y ASI NO HAY CASOS ESPECIALES.                │
 * │                                                                          │
 * │ La regla ingenua —"activo si la ruta empieza por su href"— se rompe en   │
 * │ cuanto un area tiene indice y subsecciones: con `/entrenador`,           │
 * │ `/entrenador/rutinas` y `/entrenador/ejercicios`, estando en rutinas se  │
 * │ marcarian DOS destinos, porque todo empieza por `/entrenador`.           │
 * │                                                                          │
 * │ La salida no es una bandera `exacto` en cada destino —que hay que        │
 * │ acordarse de poner, y nadie se acuerda— sino elegir el que mas coincide. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Vive aqui y no dentro del componente porque D2 la necesita en tres sitios a
 * la vez —barra lateral, cajon y barra inferior— y porque su prueba la estaba
 * COPIANDO: probaba una replica, no esto.
 */
export function destinoActivo(hrefs: readonly string[], ruta: string): string | null {
  return hrefs.reduce<string | null>((mejor, href) => {
    const coincide = ruta === href || ruta.startsWith(`${href}/`);
    if (!coincide) return mejor;
    return mejor === null || href.length > mejor.length ? href : mejor;
  }, null);
}

/**
 * Los cinco destinos de la barra inferior del socio, y los tres de "Mas".
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINCO ARRIBA Y TRES DETRAS, Y EL REPARTO NO ES ARBITRARIO.               │
 * │                                                                          │
 * │ El socio tiene siete destinos y en una barra inferior no caben siete     │
 * │ objetivos de 44 px a 375 px de ancho: saldrian a 53 px cada uno, sin     │
 * │ sitio para el texto que la navegacion tiene que llevar.                  │
 * │                                                                          │
 * │ Delante va lo que se abre DE PIE, en la puerta del gimnasio: el carne    │
 * │ para entrar, la rutina para entrenar, el inicio para ver si la cuota     │
 * │ esta al dia. Detras, lo que se consulta SENTADO y de tarde en tarde:     │
 * │ pagos, accesos y privacidad.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const DESTINOS_SOCIO: readonly Destino[] = [
  { href: '/socio', texto: 'Inicio', icono: 'inicio' },
  { href: '/socio/rutina', texto: 'Rutina', icono: 'rutinas' },
  { href: '/socio/carne', texto: 'Carne', icono: 'carne' },
  { href: '/socio/progreso', texto: 'Progreso', icono: 'progreso' },
];

export const DESTINOS_SOCIO_SECUNDARIOS: readonly Destino[] = [
  { href: '/socio/pagos', texto: 'Pagos', icono: 'pagos' },
  { href: '/socio/accesos', texto: 'Accesos', icono: 'accesos' },
  { href: '/socio/privacidad', texto: 'Privacidad', icono: 'privacidad' },
];

/** Todos los del socio. En pantalla ancha caben los siete sin repartir. */
export const DESTINOS_SOCIO_TODOS: readonly Destino[] = [
  ...DESTINOS_SOCIO,
  ...DESTINOS_SOCIO_SECUNDARIOS,
];

/**
 * Los del panel de gimnasio.
 *
 * `soloDueno` no protege nada —la autorizacion la impone el servidor— sino que
 * evita ofrecer un destino que responderia "esta seccion no es para tu rol".
 * Los precios son decision del dueno; el mostrador solo los consulta al cobrar.
 * Y la identidad juridica con la que se publica el documento de privacidad no
 * es un dato de contacto mas: la cambia quien responde por ella.
 */
export const DESTINOS_PANEL = [
  { href: '/socios', texto: 'Socios', icono: 'socios', soloDueno: false },
  { href: '/personal', texto: 'Personal', icono: 'personal', soloDueno: false },
  { href: '/planes', texto: 'Planes', icono: 'planes', soloDueno: true },
  { href: '/accesos', texto: 'Accesos', icono: 'accesos', soloDueno: false },
  {
    href: '/configuracion',
    texto: 'Configuración',
    icono: 'configuracion',
    soloDueno: true,
  },
] as const satisfies readonly (Destino & { soloDueno: boolean })[];

/**
 * Los del entrenador.
 *
 * "Ejercicios" es un destino y no un selector dentro del editor porque asi lo
 * modela el backend: la biblioteca es un recurso DEL GIMNASIO con CRUD completo
 * (ADR-0012), y responde una pregunta que existe por si sola.
 */
export const DESTINOS_ENTRENADOR: readonly Destino[] = [
  { href: '/entrenador', texto: 'Mis socios', icono: 'socios' },
  { href: '/entrenador/rutinas', texto: 'Rutinas', icono: 'rutinas' },
  { href: '/entrenador/ejercicios', texto: 'Ejercicios', icono: 'ejercicios' },
];
