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
