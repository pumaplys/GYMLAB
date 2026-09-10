import { execFileSync } from 'node:child_process';

/**
 * LOS ENLACES QUE ABREN RINDA, COMPROBADOS EN EL EMULADOR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `cmd package resolve-activity` NO SIRVE PARA ESTO, Y CUESTA VERLO.       │
 * │                                                                          │
 * │ Devuelve `ResolverActivity` —el selector de «abrir con»— aunque el       │
 * │ dominio este verificado, porque solo aplica la resolucion clasica por    │
 * │ actividad preferida e ignora la verificacion de dominio. Preguntandole a │
 * │ el, esto parecia roto.                                                   │
 * │                                                                          │
 * │ Lo que se hace aqui es DISPARAR el intent igual que lo haria el          │
 * │ navegador y mirar donde acaba. Ahi si: Android manda el enlace a RINDA.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Cuatro cosas, y las cuatro tienen que cumplirse:
 *
 *   1. `assetlinks.json` se sirve y lleva la huella del certificado;
 *   2. la APK instalada esta firmada con ESA huella;
 *   3. Android dice `verified` para el dominio;
 *   4. cada enlace aterriza en su pantalla, y una ruta que no es nuestra se
 *      va al navegador.
 *
 *   node herramientas/desarrollo/enlaces.mjs
 *
 * La app tiene que estar ya cargada desde Metro: este fichero comprueba el
 * enrutado, no el arranque.
 */
const ADB = 'C:/as/sdk/platform-tools/adb.exe';
const PAQUETE = 'tech.gymlabfit.rinda';
const DOMINIO = 'gymlabfit.tech';
const ASSETLINKS = `https://${DOMINIO}/.well-known/assetlinks.json`;

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const pasos = [];
function anotar(nombre, verde, nota = '') {
  pasos.push({ nombre, verde });
  console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}${nota ? ` — ${nota}` : ''}`);
}

/** Lo que se lee ahora mismo en pantalla. */
function textosEnPantalla() {
  const volcado = adb('exec-out', 'uiautomator', 'dump', '/dev/tty');
  return [...volcado.matchAll(/text="([^"]{3,})"/g)].map((m) => m[1]);
}

/** Dispara un enlace como lo haria el navegador y devuelve lo que se ve. */
async function abrir(enlace) {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-c',
      'android.intent.category.BROWSABLE', '-d', enlace);
  await esperar(12_000);
  return textosEnPantalla();
}

// ─── 1. El fichero de asociacion ─────────────────────────────────────────────
const respuesta = await fetch(ASSETLINKS);
const asociacion = respuesta.ok ? await respuesta.json() : null;
const huellaPublicada = asociacion?.[0]?.target?.sha256_cert_fingerprints?.[0] ?? null;
anotar(
  `1 ${ASSETLINKS} se sirve para ${PAQUETE}`,
  respuesta.ok && asociacion?.[0]?.target?.package_name === PAQUETE && !!huellaPublicada,
  respuesta.ok ? `huella de ${huellaPublicada?.length ?? 0} caracteres` : `http ${respuesta.status}`,
);

// ─── 2. La huella de la APK instalada ────────────────────────────────────────
const estado = adb('shell', 'pm', 'get-app-links', '--user', '0', PAQUETE);
const huellaInstalada = estado.match(/Signatures: \[([^\]]+)\]/)?.[1]?.trim() ?? null;
anotar(
  '2 la APK instalada esta firmada con la huella publicada',
  !!huellaInstalada && huellaInstalada === huellaPublicada,
  huellaInstalada === huellaPublicada ? 'coinciden' : 'NO coinciden',
);

// ─── 3. Lo que dice el verificador de Android ────────────────────────────────
const verificado = new RegExp(`${DOMINIO.replace('.', '\\.')}: verified`).test(estado);
anotar(`3 Android da ${DOMINIO} por verificado`, verificado);

// ─── 4. Cada enlace en su pantalla ───────────────────────────────────────────
const DESTINOS = [
  { enlace: `https://${DOMINIO}/reset-password?token=invalido`, espera: 'Elige una contraseña nueva' },
  { enlace: `https://${DOMINIO}/accept-invitation?token=invalido`, espera: 'Te han invitado a RINDA' },
  // El esquema propio lleva al mismo sitio: es el que usan los correos viejos.
  { enlace: 'rinda://restablecer?token=invalido', espera: 'Elige una contraseña nueva' },
];

for (const { enlace, espera } of DESTINOS) {
  const textos = await abrir(enlace);
  anotar(`4 ${enlace} → «${espera}»`, textos.includes(espera));
}

/*
 * Y la comprobacion que hace falta para que las anteriores signifiquen algo:
 * una ruta del MISMO dominio que no es nuestra tiene que irse al navegador. Sin
 * esto, un filtro que se quedara con todo gymlabfit.tech saldria verde arriba y
 * ademas secuestraria la web entera.
 */
const salida = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a',
  'android.intent.action.VIEW', '-c', 'android.intent.category.BROWSABLE',
  '-d', `https://${DOMINIO}/precios`);
anotar(
  `5 https://${DOMINIO}/precios NO lo captura la app`,
  !salida.includes(PAQUETE),
  salida.trim().split('\n').pop(),
);

console.log('\n=== RESUMEN DE ENLACES ===');
for (const { nombre, verde } of pasos) console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}`);
process.exit(pasos.every((p) => p.verde) ? 0 : 1);
