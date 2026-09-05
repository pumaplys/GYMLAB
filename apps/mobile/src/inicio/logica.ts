/**
 * Las decisiones de Inicio, sin React y sin red.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TODO SALE DE LO QUE LA API DA DE VERDAD. AUDITADO CONTRA EL FIXTURE.    │
 * │                                                                          │
 * │ GET /me/member-profile  firstName, lastName, memberNumber, status…      │
 * │ GET /me/dues            estado, puedeAcceder, diasRestantes, hasta, plan │
 * │ GET /me/routines        varias a la vez, SIN marca de principal          │
 * │ GET /me/progress        mediciones, de la mas reciente a la mas antigua  │
 * │                                                                          │
 * │ Y lo que NO existe, comprobado pidiendolo: /me/stats, /me/streak,        │
 * │ /me/workouts, /me/goals, /me/summary y /me/home devuelven 404. No hay    │
 * │ calorias, ni pasos, ni rachas, ni entrenamientos completados, ni tiempo  │
 * │ entrenado, ni objetivos, ni puntos, ni nivel. Nada de eso aparece aqui.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { BodyMetric, DuesStatus, Member, OwnRoutine } from '@gymlab/contracts';
// La coma decimal se escribe en UN solo sitio. Ver `comoNumero`.
import { comoNumero } from '../progreso/logica';

// --- El saludo -----------------------------------------------------------

/**
 * El saludo, segun la hora del telefono.
 *
 * Se usa la hora LOCAL del dispositivo y no la del gimnasio a proposito: esto
 * es cortesia, no un dato. Quien abre la app a las siete de la mañana en otro
 * pais espera "buenos dias", no el "buenas tardes" de su gimnasio.
 *
 * Tres tramos y ninguna madrugada especial: a las cuatro de la mañana se dice
 * "buenos dias" igual, porque quien entrena a esa hora no necesita que la app
 * se lo comente.
 */
export function saludo(nombre: string, hora: number = new Date().getHours()): string {
  const momento = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const limpio = nombre.trim();
  return limpio ? `${momento}, ${limpio}` : momento;
}

// --- Las rutinas ---------------------------------------------------------

/** Un ejercicio, reducido a lo que se enseña en una vista previa. */
export interface EjercicioBreve {
  nombre: string;
  /** "3 x 8", ya compuesto: son dos campos distintos en el contrato. */
  series: string;
}

/** Una rutina, reducida a lo que cabe en Inicio. */
export interface RutinaBreve {
  id: string;
  nombre: string;
  ejercicios: number;
}

/**
 * Que se puede decir de las rutinas de alguien.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CON VARIAS RUTINAS NO SE ELIGE UNA. NO HAY CON QUE ELEGIR.              │
 * │                                                                          │
 * │ El modelo no tiene rutina principal, ni dias, ni sesiones: `OwnRoutine`  │
 * │ no lleva ninguna marca, y se comprobo en el fixture —dos rutinas         │
 * │ vigentes, las dos asignadas EL MISMO DIA— asi que ni siquiera            │
 * │ "la mas reciente" desempata.                                            │
 * │                                                                          │
 * │ Poner una de las dos arriba y llamarla "tu rutina" seria inventarse una  │
 * │ decision del entrenador. Con varias se enseñan las dos y elige la        │
 * │ persona, que es quien sabe si hoy le toca hombro o pierna.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type PresentacionDeRutinas =
  | { tipo: 'ninguna' }
  | { tipo: 'una'; rutina: RutinaBreve; muestra: readonly EjercicioBreve[] }
  | { tipo: 'varias'; rutinas: readonly RutinaBreve[] };

/** Cuantos ejercicios se enseñan de una rutina sin abrirla. */
export const EJERCICIOS_DE_MUESTRA = 3;

export function presentacionDeRutinas(rutinas: readonly OwnRoutine[]): PresentacionDeRutinas {
  if (rutinas.length === 0) return { tipo: 'ninguna' };

  const breve = (r: OwnRoutine): RutinaBreve => ({
    id: r.id,
    nombre: r.name,
    ejercicios: r.items.length,
  });

  if (rutinas.length === 1) {
    const unica = rutinas[0] as OwnRoutine;
    return {
      tipo: 'una',
      rutina: breve(unica),
      // Por `position`, que es el orden que decidio quien la escribio.
      muestra: [...unica.items]
        .sort((a, b) => a.position - b.position)
        .slice(0, EJERCICIOS_DE_MUESTRA)
        .map((i) => ({ nombre: i.exerciseName, series: `${i.sets} x ${i.reps}` })),
    };
  }

  return { tipo: 'varias', rutinas: rutinas.map(breve) };
}

// --- El progreso ---------------------------------------------------------

/** Una medida con su unidad, lista para pintar. */
export interface MedidaBreve {
  etiqueta: string;
  valor: string;
}

export type ResumenDeProgreso =
  | { tipo: 'ninguno' }
  | { tipo: 'ultima'; fecha: string; medidas: readonly MedidaBreve[] };

/**
 * Las medidas que se enseñan, y en este orden.
 *
 * Solo tres, y las tres que la gente mira: el peso porque es la que todo el
 * mundo entiende, la grasa porque es la que de verdad cambia con el
 * entrenamiento, y la cintura porque es la que se nota en la ropa. El resto
 * —pecho, brazo, muslo, cadera— existen en el contrato y viven en Progreso:
 * en Inicio serian ocho numeros que nadie lee.
 */
const MEDIDAS = [
  { campo: 'weightKg', etiqueta: 'Peso', unidad: 'kg' },
  { campo: 'bodyFatPercent', etiqueta: 'Grasa', unidad: '%' },
  { campo: 'waistCm', etiqueta: 'Cintura', unidad: 'cm' },
] as const;

/**
 * Lo ultimo que se midio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO SE COMPARA CON NADA, Y POR TANTO NO SE DICE SI VA MEJOR O PEOR.      │
 * │                                                                          │
 * │ Dos mediciones seguidas pueden estar tomadas con dos basculas, a dos     │
 * │ horas distintas y por dos personas distintas. Poner una flecha verde     │
 * │ porque el peso bajo 400 gramos es inventarse una tendencia.              │
 * │                                                                          │
 * │ Se dice QUE se midio y CUANDO. La evolucion es de la pantalla de         │
 * │ Progreso, que tiene sitio para enseñar la serie entera.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La API devuelve de la mas reciente a la mas antigua, pero no se confia en
 * ese orden: se busca la de fecha mayor.
 */
export function resumenDeProgreso(mediciones: readonly BodyMetric[]): ResumenDeProgreso {
  if (mediciones.length === 0) return { tipo: 'ninguno' };

  const ultima = mediciones.reduce((a, b) =>
    Date.parse(a.measuredAt) >= Date.parse(b.measuredAt) ? a : b,
  );

  const medidas: MedidaBreve[] = [];
  for (const { campo, etiqueta, unidad } of MEDIDAS) {
    const valor = ultima[campo];
    if (valor === null || valor === undefined) continue;
    /*
     * `${valor}` a secas escribia el numero como lo escribe JavaScript: "71.4
     * kg" con PUNTO. Progreso, para la misma medicion, decia "71,4 kg". La
     * misma persona veia dos numeros distintos en dos pantallas de la misma
     * app, y uno de los dos no esta en español. Se usa la de Progreso, que ya
     * existia y esta probada.
     */
    medidas.push({ etiqueta, valor: `${comoNumero(valor)} ${unidad}` });
  }

  // Una medicion sin ninguna de las tres —solo perimetros, por ejemplo— no
  // tiene nada que enseñar aqui, y una fecha suelta no es informacion.
  if (medidas.length === 0) return { tipo: 'ninguno' };

  return { tipo: 'ultima', fecha: ultima.measuredAt, medidas };
}

// --- Fechas --------------------------------------------------------------

/**
 * Las dos clases de fecha del contrato viven en `src/formato/fecha.ts`.
 *
 * Se movieron alli cuando Progreso empezo a necesitarlas: dejarlas aqui
 * obligaba a que una pantalla importase de otra. Se reexportan para que nada
 * de lo que ya las usaba tenga que cambiar de sitio la importacion.
 *
 * `hasta` (de /me/dues) es una FECHA CIVIL y `measuredAt` (de /me/progress)
 * es un INSTANTE. El comentario largo, con el porque, esta en el modulo.
 */
export { fechaCivil, fechaDeInstante } from '../formato/fecha';

// --- La carga ------------------------------------------------------------

/**
 * Lo que Inicio necesita, separado por lo que pasa si falla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CUATRO PETICIONES, DOS CATEGORIAS.                                      │
 * │                                                                          │
 * │ ESENCIAL   la ficha y la cuota. Sin nombre no hay saludo y sin cuota no  │
 * │            se puede decir en que situacion estas: si fallan, la pantalla │
 * │            no tiene nada honesto que enseñar y muestra un error con      │
 * │            reintento.                                                    │
 * │                                                                          │
 * │ POR SECCION rutinas y progreso. Si falla una, su tarjeta lo dice y el    │
 * │            resto de Inicio sigue sirviendo: quien abre la app para       │
 * │            enseñar el carne no deberia encontrarse una pantalla de error │
 * │            porque el listado de rutinas dio un 500.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface DatosEsenciales {
  ficha: Member;
  cuota: DuesStatus;
}

export type Seccion<T> = { estado: 'cargando' } | { estado: 'ok'; datos: T } | { estado: 'fallo' };

export interface DatosDeInicio {
  esenciales: Seccion<DatosEsenciales>;
  rutinas: Seccion<readonly OwnRoutine[]>;
  progreso: Seccion<readonly BodyMetric[]>;
}

/**
 * Si la pantalla puede enseñar algo util.
 *
 * Solo lo esencial la tumba. Lo demas degrada por su cuenta.
 */
export function inicioEsUtil(datos: DatosDeInicio): boolean {
  return datos.esenciales.estado === 'ok';
}
