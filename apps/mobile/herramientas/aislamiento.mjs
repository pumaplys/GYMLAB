import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * GATE DE AISLAMIENTO: ni un dato de muestra puede viajar en el binario.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL PAQUETE NATIVO ES BYTECODE DE HERMES (.hbc), NO TEXTO.                │
 * │                                                                          │
 * │ Leerlo como UTF-8 y buscar la cadena tal cual encontraba "Sin socio      │
 * │ identificado" pero NO "Todavía no tiene ningún entrenador asignado":     │
 * │ Hermes guarda lo no-ASCII en UTF-16. Es decir, el escaner era ciego a    │
 * │ justo las cadenas acentuadas — que son casi todas las de muestra — y su  │
 * │ "0 fugas" no valia nada.                                                 │
 * │                                                                          │
 * │ Se busca en los BYTES, en las tres codificaciones que aparecen:          │
 * │ utf8 y utf16le en el bytecode, y ademas la forma escapada (\xNN) que usa │
 * │ el minificador en el paquete web.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const MOVIL = join(dirname(fileURLToPath(import.meta.url)), '..');

function ficheros(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ficheros(p, acc);
    else acc.push(p);
  }
  return acc;
}

const BLOQUE = /\/\*[\s\S]*?\*\//g;
const LINEA = /^[ \t]*\/\/.*$/gm;
const LITERAL = /'([^'\\\n]{6,})'|"([^"\\\n]{6,})"|`([^`\\\n$]{6,})`/g;

// 1. Cadenas de muestra: literales de los ficheros .web.ts, SIN comentarios.
const fuentes = ficheros(join(MOVIL, 'src')).filter((f) => /\.web\.tsx?$/.test(f));
const muestras = new Set();
for (const f of fuentes) {
  const texto = readFileSync(f, 'utf8').replace(BLOQUE, ' ').replace(LINEA, ' ');
  for (const m of texto.matchAll(LITERAL)) {
    const v = m[1] ?? m[2] ?? m[3];
    if (/^[./@]/.test(v)) continue;
    if (/^[a-z]+([A-Z][a-z]+)+$/.test(v)) continue;
    if (/[{}\n]/.test(v)) continue;
    if (!/ /.test(v) && !v.includes('ejemplo')) continue;
    muestras.add(v);
  }
}

// 2. Los paquetes, en BYTES.
function paquete(dir) {
  return ficheros(join(MOVIL, dir))
    .filter((f) => f.endsWith('.js') || f.endsWith('.hbc'))
    .map((f) => readFileSync(f));
}

/** La forma en que el minificador web escribe lo no-ASCII: \xNN o \uNNNN. */
function escapada(s) {
  const barra = String.fromCharCode(92);
  return [...s]
    .map((c) => {
      const n = c.codePointAt(0);
      if (n < 128) return c;
      return n < 256
        ? barra + 'x' + n.toString(16).padStart(2, '0')
        : barra + 'u' + n.toString(16).padStart(4, '0');
    })
    .join('');
}

function dentro(buffers, s) {
  const formas = [
    Buffer.from(s, 'utf8'),
    Buffer.from(s, 'utf16le'),
    Buffer.from(escapada(s), 'utf8'),
  ];
  return buffers.some((b) => formas.some((f) => b.includes(f)));
}

const web = paquete('.expo/vista-previa');
const ios = paquete('.expo/e-ios');
const android = paquete('.expo/e-android');

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA LISTA DE EXCEPCIONES SE ESCRIBE A MANO, UNA A UNA Y CON MOTIVO.       │
 * │                                                                          │
 * │ El primer intento eximia automaticamente toda cadena que tambien         │
 * │ estuviera escrita en codigo nativo. Parecia razonable y era un agujero:  │
 * │ al plantar "Recepción de Muestra" dentro de `personal/logica.ts` —una    │
 * │ fuga de manual— el gate se quedo en VERDE, porque la propia fuga         │
 * │ cumplia la condicion de la exencion.                                     │
 * │                                                                          │
 * │ Una excepcion automatica se la concede tambien el fallo que busca. Estas │
 * │ se escriben aqui, se leen de un vistazo, y cada una dice por que.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   "al fallo" — no es un dato de muestra: es la ayuda real del editor de
 *   rutinas (`entrenamiento/editor-de-rutina.tsx`), y ademas una prescripcion
 *   valida del contrato. Coincide con un valor de `rutina/fuente.web.ts`.
 */
const COINCIDENCIAS_JUSTIFICADAS = ['al fallo'];

const lista = [...muestras].filter((s) => !COINCIDENCIAS_JUSTIFICADAS.includes(s));
const coincidencias = COINCIDENCIAS_JUSTIFICADAS;
const control = lista.filter((s) => dentro(web, s));
const ausentes = lista.filter((s) => !dentro(web, s));
const fugasIos = lista.filter((s) => dentro(ios, s));
const fugasAndroid = lista.filter((s) => dentro(android, s));

// 3. Control positivo del INSTRUMENTO: copia real de pantallas nativas, con
//    acentos. Si esto no aparece, el escaner esta ciego y su "0" es mentira.
const NATIVAS = [
  'Todavía no tiene ningún entrenador asignado.',
  'las rutinas que le asignó se conservan',
  'No pudimos retirar la asignación. Inténtalo de nuevo.',
  'Sin socio identificado',
  'Asignar un entrenador',
];
const vistas = NATIVAS.filter((s) => dentro(ios, s));

console.log(
  `cadenas de muestra candidatas:        ${lista.length} (+${coincidencias.length} que tambien son copia nativa)`,
);
console.log(`CONTROL POSITIVO (en el paquete web): ${control.length}`);
console.log(`no encontradas en web:                ${ausentes.length}`);
console.log(`INSTRUMENTO (copia nativa vista en iOS): ${vistas.length}/${NATIVAS.length}`);
console.log(`FUGAS en iOS:     ${fugasIos.length}`, fugasIos.slice(0, 8));
console.log(`FUGAS en Android: ${fugasAndroid.length}`, fugasAndroid.slice(0, 8));
console.log(
  `vista-previa.invalid en iOS / Android: ${dentro(ios, 'vista-previa.invalid')} / ${dentro(android, 'vista-previa.invalid')}`,
);
console.log(`marca de muestra en el paquete web:   ${dentro(web, "get('vista')")}`);

// Rojo si hay una fuga, o si el instrumento se queda ciego otra vez.
if (fugasIos.length > 0 || fugasAndroid.length > 0 || vistas.length !== NATIVAS.length) {
  console.error('GATE EN ROJO');
  process.exit(1);
}
