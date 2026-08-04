/**
 * Guardarrail: ninguna prueba fija fechas con la zona del servidor.
 *
 * Hermano del que exige RLS a toda tabla con `gym_id` y del que vigila el
 * cableado de las variables de entorno: no comprueba una funcionalidad,
 * comprueba que nadie se salte un paso.
 *
 * ── Que paso ─────────────────────────────────────────────────────────────
 *
 * Tres pruebas de la Fase 1 escribian el vencimiento de una cuota con
 * `now()::date`, que es la fecha del SERVIDOR. Pero el dominio calcula los dias
 * que faltan en la zona del GIMNASIO, que es lo correcto y esta puesto asi a
 * proposito. Con el servidor en UTC y el gimnasio en Europe/Madrid, las dos
 * ultimas horas del dia UTC caen ya en el dia siguiente del gimnasio.
 *
 * Resultado: una prueba en rojo DOS HORAS AL DIA desde que se escribio, que
 * nadie vio porque CI casi nunca corre a esa hora. La delato una ejecucion a
 * las 22:25 UTC, y no la delato un fallo del codigo que estaba probando.
 *
 * ── Por que un guardarrail y no solo el arreglo ───────────────────────────
 *
 * Porque el arreglo no se defiende solo. Corregidas las tres, la siguiente
 * prueba que necesite una fecha volveria a escribir `now()::date` —es lo
 * evidente— y el fallo tardaria otros meses en aparecer. Una regla que solo
 * vive en un comentario es una recomendacion.
 *
 * ── Que hacer si esto se pone en rojo ────────────────────────────────────
 *
 * Usa la zona del gimnasio, que es donde vive la verdad sobre "hoy":
 *
 *   UPDATE member_subscriptions s
 *   SET current_period_end = (now() AT TIME ZONE g.timezone)::date + N
 *   FROM gyms g
 *   WHERE g.id = s.gym_id AND s.member_id = ...
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CARPETA = resolve(process.cwd(), 'src/__tests__');

/** La fecha del servidor. En una prueba con fechas de negocio, casi siempre un error. */
const FECHA_DEL_SERVIDOR = /now\(\)::date/;

/** Este mismo archivo la nombra al explicarla; su regla no se aplica a si mismo. */
const EXENTOS = new Set(['zona-horaria.test.ts']);

describe('las pruebas no fijan fechas con la zona del servidor', () => {
  it('ninguna usa now()::date fuera de un comentario', () => {
    const infractores: string[] = [];

    for (const fichero of readdirSync(CARPETA).filter((f) => f.endsWith('.ts'))) {
      if (EXENTOS.has(fichero)) continue;

      const lineas = readFileSync(resolve(CARPETA, fichero), 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        // En prosa se puede nombrar: los comentarios de arriba lo hacen para
        // explicar por que no se usa.
        if (esComentario(linea)) return;
        if (FECHA_DEL_SERVIDOR.test(linea)) infractores.push(`${fichero}:${i + 1}`);
      });
    }

    expect(infractores, mensaje(infractores)).toEqual([]);
  });
});

function esComentario(linea: string): boolean {
  const limpia = linea.trim();
  return limpia.startsWith('*') || limpia.startsWith('//') || limpia.startsWith('/*');
}

function mensaje(infractores: string[]): string {
  return (
    `Estas lineas fijan una fecha con la zona del servidor:\n  ${infractores.join('\n  ')}\n` +
    'El dominio calcula los dias en la zona del gimnasio, asi que la prueba pasa ' +
    'o falla segun la hora a la que corra CI. Usa (now() AT TIME ZONE g.timezone)::date.'
  );
}
