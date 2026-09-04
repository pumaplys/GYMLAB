/**
 * Las decisiones de Progreso, sin React y sin SVG.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL MODELO REAL, AUDITADO EN CONTRATO, API, BASE DE DATOS Y FIXTURE.     │
 * │                                                                          │
 * │ MEDICION (`BodyMetric`)                                                  │
 * │   id, measuredAt, notes, consentVersion                                  │
 * │   weightKg, bodyFatPercent, chestCm, waistCm, hipCm, armCm, thighCm      │
 * │   — las SIETE medidas son `number | null`. Todas.                       │
 * │                                                                          │
 * │ NO EXISTE, y por tanto no se dibuja: objetivo de peso, peso ideal, IMC,  │
 * │ calorias, pasos, fuerza, marcas personales, fotografias, entrenamiento   │
 * │ completado, puntuacion, ni ninguna valoracion de si un cambio es bueno.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTA PANTALLA NO INTERPRETA SALUD. NUNCA.                               │
 * │                                                                          │
 * │ Que el peso baje no es "mejor" y que la grasa suba no es "peor": depende │
 * │ de quien, de por que y de que le dijo su medico. Son datos de categoria  │
 * │ especial (RGPD art. 9) y quien los toma es un entrenador, no un          │
 * │ diagnostico.                                                             │
 * │                                                                          │
 * │ Asi que se dice la ARITMETICA —"-1,2 kg desde la anterior"— y nada mas.  │
 * │ Sin verde ni rojo, sin flechas de tendencia, sin felicitaciones. El      │
 * │ signo lo pone la resta; el significado lo pone la persona.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { BodyMetric } from '@gymlab/contracts';

// --- Que se mide ---------------------------------------------------------

/**
 * Las siete medidas del contrato, con su nombre y su unidad.
 *
 * Mismo orden y mismas etiquetas que `apps/web/src/lib/medidas.ts`: quien mira
 * su peso en el movil y en el panel tiene que leer la misma palabra. No se
 * importa de alli —son aplicaciones distintas— y por eso queda escrito aqui
 * que son dos copias de la misma lista.
 *
 * El orden ES la prioridad de la pantalla: el peso primero porque es lo que
 * todo el mundo entiende, y los perimetros despues.
 */
export const MEDIDAS = [
  { campo: 'weightKg', etiqueta: 'Peso', corta: 'Peso', unidad: 'kg' },
  { campo: 'bodyFatPercent', etiqueta: 'Grasa corporal', corta: 'Grasa', unidad: '%' },
  { campo: 'chestCm', etiqueta: 'Pecho', corta: 'Pecho', unidad: 'cm' },
  { campo: 'waistCm', etiqueta: 'Cintura', corta: 'Cintura', unidad: 'cm' },
  { campo: 'hipCm', etiqueta: 'Cadera', corta: 'Cadera', unidad: 'cm' },
  { campo: 'armCm', etiqueta: 'Brazo', corta: 'Brazo', unidad: 'cm' },
  { campo: 'thighCm', etiqueta: 'Muslo', corta: 'Muslo', unidad: 'cm' },
] as const;

export type CampoDeMedida = (typeof MEDIDAS)[number]['campo'];
export type Medida = (typeof MEDIDAS)[number];

export function medidaDe(campo: CampoDeMedida): Medida {
  return MEDIDAS.find((m) => m.campo === campo) as Medida;
}

// --- Las series ----------------------------------------------------------

/** Un punto de una serie: cuando se midio y cuanto salio. */
export interface Punto {
  /** Milisegundos desde epoch. Sale de `measuredAt`, que es un INSTANTE. */
  instante: number;
  valor: number;
  /** El `measuredAt` original, para poder escribir la fecha sin recalcular. */
  iso: string;
}

/**
 * Los puntos de UNA medida, del mas antiguo al mas reciente.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN `null` NO ES UN CERO. SE QUITA EL PUNTO, NO SE INVENTA EL VALOR.     │
 * │                                                                          │
 * │ Las siete medidas son anulables y casi nadie las mide todas: una         │
 * │ medicion con peso y sin cintura es lo normal. Convertir ese `null` en 0  │
 * │ dibujaria una caida a cero centimetros de cintura, que ademas de falso   │
 * │ es alarmante.                                                            │
 * │                                                                          │
 * │ Cada medida tiene por tanto SU PROPIA serie, con sus propias fechas.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La API devuelve de la mas reciente a la mas antigua; aqui se ordena por
 * instante ascendente, que es como se lee un grafico.
 */
export function serieDe(mediciones: readonly BodyMetric[], campo: CampoDeMedida): readonly Punto[] {
  return mediciones
    .flatMap((m) => {
      const valor = m[campo];
      if (valor === null || valor === undefined || !Number.isFinite(valor)) return [];
      const instante = Date.parse(m.measuredAt);
      if (Number.isNaN(instante)) return [];
      return [{ instante, valor, iso: m.measuredAt }];
    })
    .sort((a, b) => a.instante - b.instante);
}

/** Las medidas que tienen al menos un valor. Solo esas se ofrecen. */
export function medidasConDatos(mediciones: readonly BodyMetric[]): readonly Medida[] {
  return MEDIDAS.filter((m) => serieDe(mediciones, m.campo).length > 0);
}

/**
 * Que medida se enseña al abrir.
 *
 * La PRIMERA con datos siguiendo el orden de `MEDIDAS`. No es "la principal"
 * —ese concepto no existe— sino un orden de presentacion fijo y escrito, para
 * que la pantalla no dependa de en que orden llegaron los datos.
 */
export function medidaPorDefecto(mediciones: readonly BodyMetric[]): CampoDeMedida | null {
  return medidasConDatos(mediciones)[0]?.campo ?? null;
}

/**
 * La medida que se esta mirando, reconciliada con los datos frescos.
 *
 * Igual que en Rutina: se DERIVA. Si al refrescar la medida elegida se queda
 * sin puntos —porque el gimnasio borro esa medicion— se vuelve sola a la
 * primera que si los tenga, en vez de dejar la pantalla mirando una serie
 * vacia.
 */
export function medidaVisible(
  mediciones: readonly BodyMetric[],
  elegida: CampoDeMedida | null,
): CampoDeMedida | null {
  const conDatos = medidasConDatos(mediciones);
  if (elegida && conDatos.some((m) => m.campo === elegida)) return elegida;
  return conDatos[0]?.campo ?? null;
}

// --- El resumen ----------------------------------------------------------

/** El cambio entre las dos ultimas mediciones de una medida. */
export interface Cambio {
  /** Con signo: negativo si bajo. La resta, sin interpretar. */
  delta: number;
  /** El instante de la medicion anterior. */
  isoAnterior: string;
}

export type ResumenDeMedida =
  | { tipo: 'sinDatos' }
  /** Un solo punto: hay valor y fecha, pero NO hay con que comparar. */
  | { tipo: 'unico'; ultimo: Punto }
  | { tipo: 'serie'; ultimo: Punto; cambio: Cambio; puntos: readonly Punto[] };

export function resumenDeMedida(puntos: readonly Punto[]): ResumenDeMedida {
  if (puntos.length === 0) return { tipo: 'sinDatos' };

  const ultimo = puntos[puntos.length - 1] as Punto;
  if (puntos.length === 1) return { tipo: 'unico', ultimo };

  const anterior = puntos[puntos.length - 2] as Punto;
  return {
    tipo: 'serie',
    ultimo,
    cambio: { delta: ultimo.valor - anterior.valor, isoAnterior: anterior.iso },
    puntos,
  };
}

/**
 * Un numero, escrito como se escribe en español: coma decimal.
 *
 * Se limpian los ceros que no aportan —"72,00" es "72"— porque el contrato
 * guarda `numeric(5,2)` y devolver "72,00 kg" en la cifra grande de la
 * pantalla es ruido.
 */
export function comoNumero(valor: number, decimalesMax = 2): string {
  const redondeado = Number(valor.toFixed(decimalesMax));
  return String(redondeado).replace('.', ',');
}

/**
 * El cambio, con su signo y su unidad: "-1,2 kg", "+0,8 cm", "sin cambio".
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL SIGNO ES ARITMETICA, NO UN JUICIO.                                   │
 * │                                                                          │
 * │ Se escribe el "+" a proposito: sin el, "0,8 cm" parece un valor y no un  │
 * │ cambio. Y no se dice "has subido" ni "has bajado", que ya suena a        │
 * │ valoracion — se dice cuanto y desde cuando.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function comoCambio(delta: number, unidad: string): string {
  // SOLO la magnitud: quien lo pinta le añade "desde la anterior". La primera
  // version devolvia la frase entera en el caso del cero y en pantalla salia
  // "Sin cambio desde la anterior (kg) desde la anterior".
  const redondeado = Number(delta.toFixed(2));
  if (redondeado === 0) return 'Sin cambio';
  const signo = redondeado > 0 ? '+' : '−';
  return `${signo}${comoNumero(Math.abs(redondeado))} ${unidad}`;
}

/** Lo mismo, dicho entero para un lector de pantalla. */
export function lecturaDeCambio(delta: number, medida: Medida): string {
  const redondeado = Number(delta.toFixed(2));
  if (redondeado === 0) return `Sin cambio de ${medida.etiqueta.toLowerCase()} desde la anterior`;
  const palabra = redondeado > 0 ? 'mas' : 'menos';
  return `${comoNumero(Math.abs(redondeado))} ${medida.unidad} ${palabra} que en la medicion anterior`;
}

// --- El grafico ----------------------------------------------------------

export interface Dominio {
  min: number;
  max: number;
}

/**
 * El dominio vertical del grafico.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI DESDE CERO, NI PEGADO A LOS DATOS. LA FORMULA, ESCRITA:              │
 * │                                                                          │
 * │   rango       = max - min                                                │
 * │   centro      = (max + min) / 2                                          │
 * │   spanMinimo  = max(|centro| * 0.06, 0.5)                                │
 * │   span        = max(rango, spanMinimo)                                   │
 * │   margen      = span * 0.15                                              │
 * │   dominio     = [centro - span/2 - margen, centro + span/2 + margen]     │
 * │                                                                          │
 * │ POR QUE NO DESDE CERO: una serie de peso entre 71 y 73 kg dibujada       │
 * │ desde 0 es una linea recta pegada al techo. El cambio real —dos kilos—   │
 * │ desapareceria, y esconder el dato tambien es mentir.                     │
 * │                                                                          │
 * │ POR QUE `spanMinimo`: sin el, doscientos gramos de diferencia llenarian  │
 * │ la pantalla como un desplome. El suelo es un 6 % del valor tipico, asi   │
 * │ que un cambio pequeño se ve pequeño y uno grande se ve grande.           │
 * │                                                                          │
 * │ TODOS LOS VALORES IGUALES: `rango` es 0, manda `spanMinimo` y la linea   │
 * │ queda plana EN EL CENTRO. Ni division por cero, ni dominio degenerado.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function dominioDe(puntos: readonly Punto[]): Dominio {
  if (puntos.length === 0) return { min: 0, max: 1 };

  const valores = puntos.map((p) => p.valor);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const centro = (max + min) / 2;
  const spanMinimo = Math.max(Math.abs(centro) * 0.06, 0.5);
  const span = Math.max(max - min, spanMinimo);
  const margen = span * 0.15;

  return { min: centro - span / 2 - margen, max: centro + span / 2 + margen };
}

/** Una coordenada del grafico, ya en pixeles del lienzo. */
export interface Coordenada {
  x: number;
  y: number;
  punto: Punto;
}

/**
 * De puntos a coordenadas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA X SALE DEL TIEMPO REAL, NO DEL INDICE.                               │
 * │                                                                          │
 * │ Las mediciones NO son equidistantes: el contrato admite cualquier        │
 * │ `measuredAt` pasado y un entrenador mide cuando puede. Repartir los      │
 * │ puntos a distancias iguales dibujaria seis meses de parón con el mismo   │
 * │ ancho que una semana, y eso convierte el grafico en una mentira sobre    │
 * │ el ritmo del cambio.                                                     │
 * │                                                                          │
 * │ Si TODOS los instantes coinciden —dos mediciones fechadas el mismo       │
 * │ momento— no hay eje temporal que trazar: se reparten a lo ancho, que es  │
 * │ lo unico honesto que se puede hacer, y evita dividir por cero.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function coordenadasDe(
  puntos: readonly Punto[],
  ancho: number,
  alto: number,
  dominio: Dominio = dominioDe(puntos),
): readonly Coordenada[] {
  if (puntos.length === 0) return [];

  const t0 = puntos[0]!.instante;
  const t1 = puntos[puntos.length - 1]!.instante;
  const lapso = t1 - t0;
  const rango = dominio.max - dominio.min;

  return puntos.map((punto, i) => {
    const fraccionX =
      lapso > 0
        ? (punto.instante - t0) / lapso
        : // Mismo instante en todos: reparto uniforme. Con un solo punto, al centro.
          puntos.length === 1
          ? 0.5
          : i / (puntos.length - 1);

    // `rango` nunca es 0: `dominioDe` garantiza un span minimo.
    const fraccionY = (punto.valor - dominio.min) / rango;

    return {
      x: fraccionX * ancho,
      // La Y del SVG crece hacia abajo; el valor crece hacia arriba.
      y: alto - fraccionY * alto,
      punto,
    };
  });
}

/** El camino de la linea. Un solo `Path`, sin curvas: los datos no se suavizan. */
export function caminoDe(coordenadas: readonly Coordenada[]): string {
  return coordenadas
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ');
}

/**
 * Que fechas se rotulan bajo el grafico.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ COMO MUCHO TRES, Y LA DEL MEDIO SOLO SI DE VERDAD ESTA EN EL MEDIO.     │
 * │                                                                          │
 * │ Etiquetar los doce puntos de un año llena el pie de texto ilegible. La   │
 * │ primera y la ultima siempre: son los extremos y ahi es donde caen.       │
 * │                                                                          │
 * │ La del medio es la que tenia trampa. Los rotulos se reparten a lo ancho  │
 * │ —primero a la izquierda, ultimo a la derecha, el otro centrado— y con    │
 * │ mediciones irregulares eso ponia una fecha en mitad del grafico donde no │
 * │ habia ningun punto: en el caso del parón de catorce meses, "10 ago"      │
 * │ quedaba en el centro cuando su punto estaba al 98 % del ancho.           │
 * │                                                                          │
 * │ Asi que se busca el punto mas cercano a la mitad DEL TIEMPO y solo se    │
 * │ rotula si de verdad cae cerca del centro. Si no, dos rotulos y ya.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function referenciasDeTiempo(puntos: readonly Punto[]): readonly Punto[] {
  if (puntos.length === 0) return [];
  if (puntos.length === 1) return [puntos[0] as Punto];

  const primera = puntos[0] as Punto;
  const ultima = puntos[puntos.length - 1] as Punto;
  if (puntos.length < 5) return [primera, ultima];

  const lapso = ultima.instante - primera.instante;
  if (lapso <= 0) return [primera, ultima];

  const interiores = puntos.slice(1, -1);
  let medio = interiores[0] as Punto;
  for (const punto of interiores) {
    const distancia = Math.abs((punto.instante - primera.instante) / lapso - 0.5);
    const mejor = Math.abs((medio.instante - primera.instante) / lapso - 0.5);
    if (distancia < mejor) medio = punto;
  }

  const fraccion = (medio.instante - primera.instante) / lapso;
  if (fraccion < 0.35 || fraccion > 0.65) return [primera, ultima];

  return [primera, medio, ultima];
}

// --- Las otras medidas ---------------------------------------------------

/** Una medida de la ultima medicion, lista para pintar. */
export interface ValorReciente {
  medida: Medida;
  valor: number;
}

/**
 * Lo demas que se midio el ultimo dia.
 *
 * De la medicion MAS RECIENTE, y solo lo que tiene valor. No se rellena con
 * la ultima vez que se midio cada cosa: eso mezclaria fechas y presentaria
 * como "hoy" un perimetro de hace cuatro meses.
 */
export function otrasMedidas(
  mediciones: readonly BodyMetric[],
  excepto: CampoDeMedida | null,
): readonly ValorReciente[] {
  const ultima = medicionMasReciente(mediciones);
  if (!ultima) return [];

  return MEDIDAS.flatMap((medida) => {
    if (medida.campo === excepto) return [];
    const valor = ultima[medida.campo];
    if (valor === null || valor === undefined || !Number.isFinite(valor)) return [];
    return [{ medida, valor }];
  });
}

/**
 * La medicion mas reciente.
 *
 * La API ordena por `measured_at DESC`, pero no se confia en ese orden: se
 * busca la de instante mayor.
 */
export function medicionMasReciente(mediciones: readonly BodyMetric[]): BodyMetric | null {
  let mejor: BodyMetric | null = null;
  let mejorInstante = -Infinity;

  for (const m of mediciones) {
    const instante = Date.parse(m.measuredAt);
    if (Number.isNaN(instante)) continue;
    if (instante > mejorInstante) {
      mejor = m;
      mejorInstante = instante;
    }
  }

  return mejor;
}

/** El historial, de la mas reciente a la mas antigua, con lo que tenga cada una. */
export interface FilaDeHistorial {
  id: string;
  iso: string;
  valores: readonly ValorReciente[];
}

export function historial(mediciones: readonly BodyMetric[]): readonly FilaDeHistorial[] {
  return [...mediciones]
    .filter((m) => !Number.isNaN(Date.parse(m.measuredAt)))
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))
    .map((m) => ({
      id: m.id,
      iso: m.measuredAt,
      valores: MEDIDAS.flatMap((medida) => {
        const valor = m[medida.campo];
        if (valor === null || valor === undefined || !Number.isFinite(valor)) return [];
        return [{ medida, valor }];
      }),
    }));
}

// --- La carga ------------------------------------------------------------

export type EstadoDeCarga =
  | { fase: 'cargando' }
  | { fase: 'ok'; mediciones: readonly BodyMetric[] }
  | { fase: 'fallo'; mensaje: string };
