import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ¿PUEDE RINDA PRESENTARSE A UNA TIENDA HOY?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE GATE DEBE ESTAR ROJO AHORA MISMO, Y ESO ES LO CORRECTO.            │
 * │                                                                          │
 * │ Existe para que una publicacion accidental no pueda presentar un texto   │
 * │ marcado BORRADOR como la politica legal definitiva de RINDA. Lo que      │
 * │ impide es declararse «listo para tienda», no desarrollar: por eso NO va  │
 * │ en el `pnpm test` de cada commit.                                        │
 * │                                                                          │
 * │ La forma de ponerlo verde es que alguien con competencia para ello       │
 * │ apruebe los textos y se quiten los avisos. NO inventar valores.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/listo-para-tiendas.mjs
 *
 * Sale 0 si RINDA puede presentarse; 1 si no. Enumera SIEMPRE todo lo que
 * falta, no solo lo primero: quien vaya a resolverlo necesita la lista entera,
 * no descubrirla de uno en uno.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(AQUI, '..');
const RAIZ = resolve(WEB, '..', '..');

const pendientes = [];
const anotar = (que, porque) => pendientes.push({ que, porque });

// ─── 1. La politica de privacidad, tal y como se sirve ───────────────────────
{
  const pagina = join(WEB, 'src', 'app', 'privacidad', 'page.tsx');
  if (!existsSync(pagina)) {
    anotar('no existe la página /privacidad', 'las dos tiendas exigen una URL pública');
  } else {
    const codigo = readFileSync(pagina, 'utf8');
    /*
     * Se busca el aviso EN EL TEXTO QUE SE PINTA, no una constante ni un
     * comentario. Lo que ve una persona es lo que la tienda considera la
     * politica; un comentario en el codigo no lo lee nadie.
     */
    if (/<strong>Borrador\.<\/strong>/.test(codigo)) {
      anotar(
        '/privacidad se sirve marcada BORRADOR',
        'no puede darse como política definitiva mientras lo diga',
      );
    }
    if (/Lo que falta en este borrador/.test(codigo)) {
      anotar(
        '/privacidad declara que le faltan campos jurídicos',
        'responsable, plazos, encargados y base jurídica de cada finalidad',
      );
    }
  }

  const soporte = join(WEB, 'src', 'app', 'soporte', 'page.tsx');
  if (!existsSync(soporte)) {
    anotar('no existe la página /soporte', 'App Store exige una Support URL');
  } else if (/<strong>Borrador\.<\/strong>/.test(readFileSync(soporte, 'utf8'))) {
    anotar('/soporte se sirve marcada BORRADOR', 'falta el buzón de soporte definitivo');
  }
}

// ─── 2. El consentimiento de datos de salud ──────────────────────────────────
{
  /*
   * Se pregunta a la BASE DE DATOS de desarrollo, que es donde vive el estado
   * real de la plantilla. Si no hay base delante no se calla: se dice que no
   * se ha podido comprobar, que NO es lo mismo que estar bien.
   */
  let filas = null;
  try {
    const salida = execFileSync(
      'docker',
      [
        'exec',
        'gymlab-postgres',
        'psql',
        '-U',
        'gymlab',
        '-d',
        'gymlab',
        '-t',
        '-A',
        '-c',
        "select version || '|' || is_draft from consent_document_templates where purpose = 'health_data';",
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    filas = salida.trim().split('\n').filter(Boolean);
  } catch {
    anotar(
      'no se ha podido comprobar el consentimiento de salud',
      'hace falta la base de datos de desarrollo en marcha; no comprobado NO es aprobado',
    );
  }

  if (filas) {
    if (filas.length === 0) {
      anotar('no hay ninguna plantilla de consentimiento de salud', 'no habría nada que consentir');
    }

    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ SE PARTE POR EL SEPARADOR; NO SE MIRA COMO ACABA LA CADENA.      │
     * │                                                                  │
     * │ La primera version comparaba con «|t», dando por hecho que psql  │
     * │ imprime los booleanos como «t». Los imprime como «true», asi que │
     * │ el filtro no casaba NUNCA: el gate daba por bueno el             │
     * │ consentimiento sin haberlo mirado, y no se quejaba. Un guardian  │
     * │ que falla en silencio es peor que no tenerlo.                     │
     * │                                                                  │
     * │ Por eso ademas se comprueba que cada fila se ENTIENDE: si el     │
     * │ formato vuelve a cambiar, esto grita en vez de callarse.          │
     * └──────────────────────────────────────────────────────────────────┘
     */
    const ilegibles = [];
    const borradores = [];
    for (const fila of filas) {
      const partes = fila.split('|');
      const marca = partes.at(-1)?.trim().toLowerCase();
      if (!['true', 't', 'false', 'f'].includes(marca ?? '')) {
        ilegibles.push(fila);
        continue;
      }
      if (marca === 'true' || marca === 't') borradores.push(partes.slice(0, -1).join('|'));
    }

    if (ilegibles.length > 0) {
      anotar(
        `no se entiende el estado de ${ilegibles.length} plantilla(s) de consentimiento`,
        `filas: ${ilegibles.join(' / ')} — arregla el gate antes de fiarte de él`,
      );
    }
    if (borradores.length > 0) {
      anotar(
        `el consentimiento de salud sigue en borrador: ${borradores.join(', ')}`,
        'con is_draft en cierto, producción no publica documento y Progreso queda inerte',
      );
    }
  }
}

// ─── 3. El pack de revisión legal ────────────────────────────────────────────
{
  const pack = join(RAIZ, 'docs', '19-legal-review-pack.md');
  if (!existsSync(pack)) {
    anotar('falta docs/19-legal-review-pack.md', 'es donde viven los huecos jurídicos');
  } else {
    const texto = readFileSync(pack, 'utf8');
    const huecos = [...texto.matchAll(/\*\*PENDIENTE\*\*/g)].length;
    const filasAB = [...texto.matchAll(/^\| A\d+ \||^\| B\d+ \|/gm)].length;
    if (huecos > 0 || filasAB > 0) {
      anotar(
        `el pack de revisión legal tiene ${filasAB} huecos y ${huecos} plazos sin decidir`,
        'ninguno lo puede rellenar quien escribe el código',
      );
    }
  }
}

// ─── Veredicto ───────────────────────────────────────────────────────────────
if (pendientes.length === 0) {
  console.log('LISTO PARA TIENDAS: no queda ningún bloqueo jurídico.');
  process.exit(0);
}

console.error('NO LISTO PARA TIENDAS. Falta:\n');
for (const { que, porque } of pendientes) console.error(`  · ${que}\n      ${porque}\n`);
console.error(
  'Esto NO impide desarrollar ni fusionar: impide declararse listo para tienda.\n' +
    'La forma de ponerlo verde es aprobar los textos, no inventar valores.',
);
process.exit(1);
