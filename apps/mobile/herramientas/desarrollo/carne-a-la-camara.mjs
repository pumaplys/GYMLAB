import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pone un carne RECIEN FIRMADO delante de la camara del emulador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE ESTE FICHERO EXISTE.                                             │
 * │                                                                          │
 * │ El token del carne vive 60 s (`TTL_MS` en la API, y no se toca: es una   │
 * │ regla del producto, no un estorbo de pruebas). El poster de la escena    │
 * │ virtual se lee al arrancar el emulador, y arrancar tarda mas de 60 s:    │
 * │ por ese camino el token SIEMPRE llegaba caducado y el escaner solo       │
 * │ habria probado el camino del error.                                      │
 * │                                                                          │
 * │ La consola del emulador tiene `virtualscene-image`, que cambia el poster │
 * │ EN CALIENTE. Firmar el token y colgarlo en la pared tarda ~2 s, asi que  │
 * │ al escaner le llega con casi todo su minuto por delante.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/desarrollo/carne-a-la-camara.mjs
 *
 * Requiere el emulador arrancado con `-camera-back virtualscene`.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..', '..');
const PNG = join(MOVIL, '.expo', 'carne.png');
const ADB = 'C:/as/sdk/platform-tools/adb.exe';

const empezo = Date.now();
execFileSync(process.execPath, [join(AQUI, 'carne-de-prueba.mjs'), PNG], { stdio: 'inherit' });

// Las dos superficies de la escena: da igual hacia donde mire la camara.
for (const superficie of ['wall', 'table']) {
  execFileSync(ADB, ['emu', 'virtualscene-image', superficie, PNG], { stdio: 'pipe' });
}

console.log(`Carne colgado en la escena en ${((Date.now() - empezo) / 1000).toFixed(1)} s.`);
