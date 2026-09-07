/**
 * La UNICA forma soportada de construir y servir la vista previa web.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO EXISTE PORQUE UNA VISTA PREVIA LLEGO A HABLAR CON PRODUCCION.       │
 * │                                                                          │
 * │ El 2026-09-07, durante PARITY-0B, una exportacion perdio                 │
 * │ `EXPO_PUBLIC_VISTA_PREVIA=1` al encadenarse detras de las de iOS y       │
 * │ Android. Sin esa variable las fuentes de muestra se eliminan por codigo  │
 * │ muerto, la pantalla llama a la API de verdad, y —esto es lo que nadie    │
 * │ espera— `expo export` produce un paquete de RELEASE, donde               │
 * │ `src/api/config.ts` rechaza a proposito la IP privada del `.env` y cae   │
 * │ al dominio de PRODUCCION.                                                │
 * │                                                                          │
 * │ Resultado: un `POST /v1/auth/forgot-password` real contra produccion.    │
 * │ No se envio correo, pero quedo una fila de auditoria que no se borra.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/vista-previa.mjs            construye y sirve en :8082
 *   node herramientas/vista-previa.mjs --solo-construir
 *
 * DOS CERROJOS, y el segundo es el que de verdad cierra la puerta:
 *
 *   1. La variable se pone AQUI, no en quien llama. No se puede olvidar.
 *   2. La API apunta a un dominio que NO PUEDE EXISTIR. Aunque una pantalla
 *      se dejara sin fuente de muestra, su peticion no tiene a donde ir.
 *
 * Y despues de construir se COMPRUEBA que la vista previa esta dentro del
 * paquete. Si no lo esta, esto no sirve nada: falla.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..');
const DESTINO = join(MOVIL, '.expo', 'vista-previa');
const PUERTO = 8082;

/**
 * `.invalid` esta reservado por el RFC 2606 justamente para esto: ningun
 * resolutor del mundo puede devolver una direccion. Y es HTTPS a proposito,
 * porque `esDeDesarrollo` descarta todo lo que no lo sea y volveria a caer en
 * produccion. Ver `src/api/config.ts`.
 */
export const API_IMPOSIBLE = 'https://vista-previa.invalid/v1';

/** La marca de que las fuentes de muestra sobrevivieron al minificador. */
export const MARCA_DE_MUESTRA = "get('vista')";

function construir() {
  console.log('Construyendo la vista previa…');
  /*
   * Se llama al CLI de Expo por su fichero, no por `npx`. Con `npx` harian
   * falta `shell: true` en Windows —Node 24 se niega a lanzar un `.cmd` sin
   * el— y entonces los argumentos viajan sin escapar, cosa que Node avisa.
   * Resolviendo el modulo no hace falta interprete de ordenes en ningun sitio.
   */
  const cli = createRequire(join(MOVIL, 'package.json')).resolve('expo/bin/cli');
  execFileSync(
    process.execPath,
    [cli, 'export', '--platform', 'web', '--clear', '--output-dir', DESTINO],
    {
      cwd: MOVIL,
      stdio: 'inherit',
      env: {
        ...process.env,
        EXPO_PUBLIC_VISTA_PREVIA: '1',
        EXPO_PUBLIC_API_URL: API_IMPOSIBLE,
      },
    },
  );
}

function comprobar() {
  const dir = join(DESTINO, '_expo', 'static', 'js', 'web');
  const js = existsSync(dir) ? readdirSync(dir).find((n) => n.endsWith('.js')) : undefined;
  if (js === undefined) throw new Error('la exportacion no ha dejado ningun paquete');

  const paquete = readFileSync(join(dir, js), 'utf8');
  if (!paquete.includes(MARCA_DE_MUESTRA)) {
    throw new Error(
      'el paquete NO lleva la vista previa: sus pantallas hablarian con una API de verdad',
    );
  }
  if (!paquete.includes(API_IMPOSIBLE)) {
    throw new Error(`el paquete no apunta a ${API_IMPOSIBLE}: podria salir de este ordenador`);
  }
  console.log(`\nComprobado: la vista previa esta dentro y la API apunta a ${API_IMPOSIBLE}.`);
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function servir() {
  createServer((peticion, respuesta) => {
    const ruta = decodeURIComponent((peticion.url ?? '/').split('?')[0]);
    let fichero = join(DESTINO, ruta);
    // `output: "single"`: cualquier ruta que no sea un fichero es la misma
    // pagina, y quien reparte por dentro es expo-router.
    if (!fichero.startsWith(DESTINO) || !existsSync(fichero) || statSync(fichero).isDirectory()) {
      fichero = join(DESTINO, 'index.html');
    }
    respuesta.setHeader('Content-Type', TIPOS[extname(fichero)] ?? 'application/octet-stream');
    createReadStream(fichero).pipe(respuesta);
  }).listen(PUERTO, () => console.log(`Vista previa en http://localhost:${PUERTO}`));
}

construir();
comprobar();
if (!process.argv.includes('--solo-construir')) servir();
