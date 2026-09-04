/**
 * Fechas, en un solo sitio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VIVIAN EN `inicio/logica.ts` Y AHORA LAS USAN TRES PANTALLAS.           │
 * │                                                                          │
 * │ Se mueven aqui por el mismo motivo por el que en M5 se saco la lectura   │
 * │ de la cuota de `carne/`: que Progreso importe de Inicio ata dos          │
 * │ pantallas que no tienen nada que ver, y la siguiente que necesite una    │
 * │ fecha ataria una tercera.                                                │
 * │                                                                          │
 * │ `inicio/logica.ts` las reexporta, asi que Inicio no cambia ni una linea. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL CONTRATO TIENE DOS CLASES DE FECHA, Y NO SE FORMATEAN IGUAL.         │
 * │                                                                          │
 * │ `hasta` (de /me/dues) es una FECHA CIVIL: "2026-09-20", sin hora. Sale   │
 * │ de una columna de fecha y significa un dia del calendario. El 20 de      │
 * │ septiembre es el 20 de septiembre en Tokio y en Los Angeles.             │
 * │                                                                          │
 * │ `measuredAt` (de /me/progress) es un INSTANTE: el contrato lo declara    │
 * │ `z.string().datetime()`, con hora y zona. El dia que le corresponde SI   │
 * │ depende de donde este quien mira.                                        │
 * │                                                                          │
 * │ Formatearlas con la misma funcion era el error: una de las dos iba a     │
 * │ salir mal. Partir la cadena esta BIEN para la civil y MAL para el        │
 * │ instante; convertir a fecha local esta bien para el instante y mal para  │
 * │ la civil, que se desplazaria un dia al oeste de Greenwich.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Una fecha del calendario, dicha en corto: "20 sep 2026".
 *
 * Se parte la cadena y NO se construye ningun `Date`: asi no hay huso que la
 * mueva. Es lo correcto para `hasta`, que es un dia, no un momento.
 */
export function fechaCivil(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!partes) return iso;
  const [, anio, mes, dia] = partes;
  const nombre = MESES[Number(mes) - 1];
  if (!nombre) return iso;
  return `${Number(dia)} ${nombre} ${anio}`;
}

/**
 * El dia LOCAL de un instante: "24 ago 2026".
 *
 * Aqui si se convierte, y a proposito. Una medicion tomada a las 00:30 en
 * Madrid ocurrio el dia 24 para quien la mira, aunque en UTC sea todavia el
 * 23. Enseñar el dia UTC seria decirle que se peso un dia que no fue.
 */
export function fechaDeInstante(iso: string): string {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return iso;
  const nombre = MESES[momento.getMonth()];
  if (!nombre) return iso;
  return `${momento.getDate()} ${nombre} ${momento.getFullYear()}`;
}


/**
 * El dia y el mes de un instante, sin el año: "24 ago".
 *
 * Para los rotulos del grafico, donde el año se repite en los tres y no cabe.
 * Misma conversion a hora local que `fechaDeInstante`, por el mismo motivo.
 */
/**
 * La hora local de un instante: "18:42".
 *
 * Para el historial de accesos, donde saber el dia no basta: quien mira quiere
 * reconocer "el martes por la tarde". Misma conversion a hora local que
 * `fechaDeInstante`, y por el mismo motivo.
 */
export function horaDeInstante(iso: string): string {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return '';
  const hh = String(momento.getHours()).padStart(2, '0');
  const mm = String(momento.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function fechaCortaDeInstante(iso: string): string {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return iso;
  const nombre = MESES[momento.getMonth()];
  if (!nombre) return iso;
  return `${momento.getDate()} ${nombre}`;
}
