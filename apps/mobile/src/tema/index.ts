/**
 * El tema de la app movil. Un solo sitio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NINGUN COMPONENTE NOMBRA UN COLOR. NOMBRAN UN PAPEL.                     │
 * │                                                                          │
 * │ `tema.color.acento`, nunca `#A3FF12`. Es lo que permite dos cosas que    │
 * │ hoy no toca hacer pero que van a hacer falta: un tema claro, y cambiar   │
 * │ la identidad de marca sin volver a tocar una sola pantalla.              │
 * │                                                                          │
 * │ Por eso el objeto se exporta con `as const` y los componentes leen de    │
 * │ `tema`, no de las constantes sueltas: el dia que haya dos temas, lo que  │
 * │ cambia es de donde sale el objeto, no quien lo usa.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * La paleta oscura. Es la unica que existe en M1.
 *
 * SOBRE EL LIMA, porque es la decision que mas facil es estropear: `#A3FF12`
 * sobre `#0D0F12` da un contraste altisimo —medido, 15.6:1— y eso lo hace
 * excelente para texto y numeros, y agresivo como fondo. La regla del sistema
 * es UN solo boton lima por pantalla; el resto de acciones usan superficie.
 * No esta escrita en el codigo porque no se puede: es una decision de cada
 * pantalla, y queda aqui para que se lea antes de dibujarla.
 */
const color = {
  /** El fondo de la aplicacion. */
  fondo: '#0D0F12',
  /** Una tarjeta sobre el fondo. */
  superficie: '#171A1F',
  /** Algo que se levanta sobre una tarjeta. Se usa poco a proposito. */
  superficieAlta: '#20242B',
  borde: '#2B3038',

  /** La accion principal, la pestana activa, el numero que importa. */
  acento: '#A3FF12',
  acentoPulsado: '#8DE600',
  /** Un segundo color para lo informativo. No compite con el acento. */
  secundario: '#5EEAD4',
  /** Lo que va ENCIMA del acento: casi negro, no blanco. */
  sobreAcento: '#0D0F12',

  texto: '#F7F8FA',
  textoSecundario: '#A7ADB7',

  exito: '#32D583',
  aviso: '#FDB022',
  peligro: '#F97066',
} as const;

/**
 * El mismo color, translucido.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO EXISTE PARA QUE NINGUN COMPONENTE ESCRIBA UN `rgba(...)`.          │
 * │                                                                          │
 * │ `Aviso` y `Etiqueta` tenian los mismos tres colores escritos a mano en   │
 * │ rgba —"rgba(50,213,131,0.12)"— y ademas con DOS opacidades distintas,    │
 * │ 0.10 en uno y 0.12 en el otro, que no habia decidido nadie. Si mañana    │
 * │ cambia `exito`, esas copias se quedan con el color viejo y el sistema    │
 * │ pasa a tener dos verdes.                                                 │
 * │                                                                          │
 * │ Se DERIVA del hex de la paleta, asi que no puede desviarse.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function componentes(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Los colores que pueden teñir un fondo: los que significan algo. */
export type RolConTinte = 'acento' | 'secundario' | 'exito' | 'aviso' | 'peligro';

const tinte = {
  /** Un tinte de fondo. Suficiente para separar, insuficiente para gritar. */
  fondo: (rol: RolConTinte) => `rgba(${componentes(color[rol])},0.12)`,
  /** El borde del mismo bloque, algo mas presente que su fondo. */
  borde: (rol: RolConTinte) => `rgba(${componentes(color[rol])},0.35)`,
} as const;

/** Multiplos de 4. Si algo no encaja en esta escala, encaja mal. */
const espacio = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

const radio = {
  campo: 12,
  boton: 14,
  tarjeta: 18,
  /** Pastillas de estado. */
  pastilla: 999,
} as const;

/**
 * Tipografia. Sin fuente propia todavia: San Francisco en iOS, Roboto en
 * Android. Decidir una fuente de marca es una decision de identidad y no de
 * cimientos.
 *
 * Nada baja de 12.
 */
const texto = {
  display: { fontSize: 30, fontWeight: '700' },
  h1: { fontSize: 26, fontWeight: '700' },
  h2: { fontSize: 21, fontWeight: '600' },
  h3: { fontSize: 17, fontWeight: '600' },
  /** El numero que se viene a mirar: un importe, unos dias, un peso. */
  dato: { fontSize: 28, fontWeight: '700' },
  cuerpo: { fontSize: 16, fontWeight: '400' },
  secundario: { fontSize: 14, fontWeight: '400' },
  meta: { fontSize: 12, fontWeight: '500' },
} as const;

/**
 * El alto minimo de cualquier cosa que se toque.
 *
 * 44 no es una preferencia: es el minimo de las guias de accesibilidad de las
 * dos plataformas, y el mismo numero que ya usa el panel web bajo
 * `pointer: coarse`.
 */
const controlAltoMinimo = 44;

export const tema = { color, tinte, espacio, radio, texto, controlAltoMinimo } as const;

export type Tema = typeof tema;
