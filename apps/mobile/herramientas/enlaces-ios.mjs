import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LOS UNIVERSAL LINKS DE iOS, HASTA DONDE SE PUEDE MEDIR SIN UN iPHONE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CADENA TIENE CUATRO ESLABONES. TRES SE MIDEN AQUI; EL CUARTO NO.     │
 * │                                                                          │
 * │   1. la app declara `applinks:<dominio>` en sus entitlements FIRMADOS;   │
 * │   2. Apple ha ido a buscar el AASA y lo sirve desde su propia CDN, que   │
 * │      es de donde lo lee un iPhone al instalar;                           │
 * │   3. el appID del AASA es el mismo que el del binario, y las rutas son   │
 * │      exactamente las previstas;                                          │
 * │   4. iOS, en el dispositivo, decide abrir la app en vez de Safari.       │
 * │                                                                          │
 * │ El (4) necesita un iPhone o el simulador de macOS. En este entorno       │
 * │ —Windows— no existe ninguno de los dos, y alquilar una granja de         │
 * │ dispositivos cuesta dinero. Se documenta como lo que es: el unico punto  │
 * │ que no se puede automatizar aqui.                                        │
 * │                                                                          │
 * │ Lo que NO se acepta como sustituto es «servimos el fichero». Eso es el   │
 * │ (2) a medias: que TU sirvas el AASA no dice que Apple lo haya aceptado.  │
 * │ Por eso se pregunta a la CDN de Apple, que durante meses dio 404.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/enlaces-ios.mjs [carpeta/del/.app]
 *
 * Sin argumento usa el IPA ya abierto por `artefacto-ios.mjs`.
 */
const DOMINIO = 'gymlabfit.tech';
const AASA = `https://${DOMINIO}/.well-known/apple-app-site-association`;
const CDN_DE_APPLE = `https://app-site-association.cdn-apple.com/a/v1/${DOMINIO}`;

/** Las rutas del panel web que abren la app, y la pantalla de cada una. */
const RUTAS = [
  { web: '/reset-password', pantalla: '/restablecer' },
  { web: '/accept-invitation', pantalla: '/invitacion' },
];

const pasos = [];
function anotar(nombre, verde, detalle = '') {
  pasos.push({ nombre, verde });
  console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

const app = process.argv[2] ?? join(process.cwd(), '.expo', 'ipa-abierto', 'Payload', 'RINDA.app');

// ─── 1. Lo que declara el binario ────────────────────────────────────────────
console.log('=== 1. LO QUE DECLARA LA APP (firma del binario) ===');
let appIdDelBinario = null;
if (!existsSync(app)) {
  anotar('el .app esta disponible para mirarlo', false, `no existe ${app}`);
} else {
  const info = readFileSync(join(app, 'Info.plist'), 'utf8');
  const ejecutable = info.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  const binario = readFileSync(join(app, ejecutable)).toString('latin1');
  const i = binario.indexOf('<?xml');
  const firmados = i >= 0 ? binario.slice(i, binario.indexOf('</plist>', i) + 8) : '';

  appIdDelBinario = firmados.match(/<key>application-identifier<\/key>\s*<string>([^<]+)<\/string>/)?.[1] ?? null;
  const bloque = firmados.match(
    /<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/,
  )?.[1];
  const dominiosDelBinario = bloque ? [...bloque.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]) : [];

  anotar('el binario declara applinks para el dominio',
    dominiosDelBinario.includes(`applinks:${DOMINIO}`), dominiosDelBinario.join(', ') || 'AUSENTE');
  anotar('application-identifier del binario', !!appIdDelBinario, appIdDelBinario ?? 'AUSENTE');
}

// ─── 2. Lo que sirve el dominio, y lo que Apple ha aceptado ──────────────────
console.log('\n=== 2. EL AASA ===');
const nuestra = await fetch(AASA, { redirect: 'manual' });
anotar('lo servimos con 200, sin redireccion',
  nuestra.status === 200, `http ${nuestra.status}`);
anotar('y como application/json',
  (nuestra.headers.get('content-type') ?? '').includes('application/json'),
  nuestra.headers.get('content-type') ?? '(sin cabecera)');

const deApple = await fetch(CDN_DE_APPLE);
/*
 * Este es el que importa: un iPhone NO lee tu servidor, lee esta CDN. Que aqui
 * haya 200 significa que Apple fue a buscarlo, lo entendio y lo esta
 * repartiendo. Mientras el App ID no tuvo la capacidad, esto daba 404.
 */
anotar('Apple lo ha ido a buscar y lo sirve desde su CDN',
  deApple.status === 200, `http ${deApple.status}`);

// ─── 3. Que digan lo mismo ───────────────────────────────────────────────────
console.log('\n=== 3. QUE TODOS DIGAN LO MISMO ===');
const contenido = deApple.status === 200 ? await deApple.json() : await nuestra.json();
const detalle = contenido?.applinks?.details?.[0];
const appIds = detalle?.appIDs ?? [];
const rutas = (detalle?.components ?? []).map((c) => c['/']);

anotar('el appID del AASA es el del binario',
  appIds.length === 1 && appIds[0] === appIdDelBinario, `${appIds.join(', ')} vs ${appIdDelBinario}`);
anotar(`solo estan las ${RUTAS.length} rutas de auth previstas`,
  rutas.length === RUTAS.length && RUTAS.every((r) => rutas.includes(r.web)), rutas.join(', '));
/*
 * Y que no haya un comodin: `"/": "*"` capturaria la web entera y la app se
 * comeria enlaces que son del navegador.
 */
anotar('sin comodines que secuestren el resto del dominio',
  !rutas.some((r) => r === '*' || r === '/*'), rutas.join(', '));

// ─── 4. Que la app sepa que hacer con esas rutas ─────────────────────────────
console.log('\n=== 4. QUE LA APP SEPA QUE HACER CON ELLAS ===');
/*
 * El enrutado es JavaScript COMPARTIDO con Android, donde ya se recorrio con
 * los enlaces de verdad. Aqui se comprueba que ese mismo codigo viaja en el
 * paquete de iOS: si la traduccion no estuviera, el enlace abriria la app y se
 * quedaria en una pantalla que no existe.
 */
if (existsSync(app)) {
  const paquete = readFileSync(join(app, 'main.jsbundle')).toString('latin1');
  for (const { web, pantalla } of RUTAS) {
    anotar(`el paquete de iOS traduce ${web} -> ${pantalla}`,
      paquete.includes(web) && paquete.includes(pantalla));
  }
}

// ─── El limite ───────────────────────────────────────────────────────────────
console.log('\n=== LO QUE NO SE PUEDE MEDIR AQUI ===');
console.log('  El salto del sistema operativo: que iOS abra RINDA en vez de Safari.');
console.log('  Necesita un iPhone o el simulador de macOS, y este entorno es Windows.');
console.log('  No se sustituye por nada: los cuatro eslabones de arriba lo hacen');
console.log('  probable, no cierto.');

console.log('\n=== RESUMEN ===');
for (const { nombre, verde } of pasos) console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}`);
process.exit(pasos.every((p) => p.verde) ? 0 : 1);
