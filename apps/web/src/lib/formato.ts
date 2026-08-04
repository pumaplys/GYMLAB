const FECHA = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Fecha corta, en el formato que se lee en Espana.
 *
 * La API devuelve ISO 8601 (UTC) y aqui se pinta en la zona del navegador, que
 * es la del gimnasio. Solo se usa en datos ya cargados, nunca en el HTML que se
 * genera al construir: si se prerrenderizara, el servidor de construccion y el
 * navegador podrian estar en zonas distintas y React avisaria de que el
 * contenido no coincide.
 */
export function comoFecha(iso: string): string {
  return FECHA.format(new Date(iso));
}

/** Centimos enteros -> "19,99 €". La division solo se usa para pintar. */
export function comoImporte(centimos: number, moneda: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(
    centimos / 100,
  );
}

/**
 * Lo que se teclea en el mostrador -> centimos enteros. `null` si no vale.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN MULTIPLICAR POR 100 EN NINGUN MOMENTO.                               │
 * │                                                                          │
 * │ `Number('19.99') * 100` da 1998.9999999999998, y redondear eso funciona  │
 * │ casi siempre — que es la peor clase de error. Aqui se separan las dos    │
 * │ mitades como TEXTO y se suman enteros, asi que no hay coma flotante que  │
 * │ pueda desviarse.                                                        │
 * │                                                                          │
 * │ El contrato ya dice que el dinero viaja en centimos enteros; esto es lo  │
 * │ que impide que la pantalla sea quien lo incumpla.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se acepta coma o punto: en un teclado espanol sale coma, y en el numerico
 * de muchos teclados sale punto.
 */
export function aCentimos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;

  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}
