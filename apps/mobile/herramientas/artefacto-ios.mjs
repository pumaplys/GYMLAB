import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * QUE EL IPA QUE SE DISTRIBUIRIA SEA EL QUE CREEMOS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO SE MIRA `app.json`. SE MIRA EL BINARIO.                              │
 * │                                                                          │
 * │ `app.json` dice lo que se PIDIO; el IPA dice lo que SALIO. Entre los dos │
 * │ hay un plugin de Expo, un prebuild, Xcode y un perfil de                 │
 * │ aprovisionamiento firmado por Apple — y ahi es justo donde se perdio el  │
 * │ entitlement de Associated Domains durante semanas: `app.json` declaraba  │
 * │ `applinks:gymlabfit.tech` y el perfil no lo llevaba, asi que los         │
 * │ Universal Links nunca funcionaron y nada lo decia.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/artefacto-ios.mjs ruta/al/app.ipa
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..');

const APP = 'tech.gymlabfit.rinda';
const DOMINIO = 'gymlabfit.tech';
const API_DE_PRODUCCION = 'https://gymlabfit.tech/v1';
const ASOCIACION = `applinks:${DOMINIO}`;

/**
 * Los permisos de iOS que se admiten, y por que.
 *
 * En iOS un permiso se pide teniendo una `NS…UsageDescription` en el
 * `Info.plist`: sin ella el sistema ni siquiera pregunta. Asi que la lista de
 * claves ES la lista de permisos.
 *
 * Escrita a mano, como la de Android: una clave que aparezca y no este aqui
 * pone esto en rojo aunque la haya metido una libreria. Que la traiga una
 * dependencia no la hace aceptable — la hace algo que hay que decidir.
 */
const PERMISOS_ADMITIDOS = [
  { clave: 'NSCameraUsageDescription', porque: 'el escaner de carnes de la puerta' },
];

/** Lo que NO puede viajar en un artefacto de produccion. */
const PROHIBIDO = [
  { patron: 'vista-previa.invalid', porque: 'la vista previa web se colo en el binario' },
  { patron: '10.0.2.2', porque: 'la puerta del emulador de Android' },
  { patron: 'localhost:3001', porque: 'la API de desarrollo' },
];

/*
 * `192.168.` aparece ADEMAS dentro de `esDeDesarrollo`, que es una defensa y no
 * una fuga: su expresion regular enumera las franjas privadas para RECHAZARLAS.
 * En el bytecode de Hermes los puntos ya no van escapados, asi que se lee como
 * texto plano. Se distingue por el contexto: una fuga de verdad es una URL.
 */
const ES_UNA_URL_LOCAL = (texto) => /https?:\/\/[^\s"']*192\.168\./.test(texto);

const pasos = [];
function anotar(nombre, verde, detalle = '') {
  pasos.push({ nombre, verde });
  console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

/** Abre el IPA, que es un zip, sin traerse ninguna dependencia. */
function abrir(ruta) {
  const fuera = join(MOVIL, '.expo', 'ipa-abierto');
  rmSync(fuera, { recursive: true, force: true });
  mkdirSync(fuera, { recursive: true });
  try {
    execFileSync('tar', ['-xf', resolve(ruta), '-C', fuera], { stdio: 'pipe' });
  } catch {
    execFileSync('unzip', ['-q', '-o', resolve(ruta), '-d', fuera], { stdio: 'pipe' });
  }
  const payload = join(fuera, 'Payload');
  const app = execFileSync(process.platform === 'win32' ? 'cmd' : 'sh',
    process.platform === 'win32' ? ['/c', 'dir', '/b', payload] : ['-c', `ls ${payload}`],
    { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  return join(payload, app);
}

/**
 * Una clave del plist XML, buscada a cualquier profundidad.
 *
 * Devuelve `true`/`false` para los booleanos, el texto para las cadenas y
 * `null` si la clave no esta. Suficiente y comprobable para lo que se mira
 * aqui; no pretende ser un lector de plist completo, y por eso no lo parece.
 */
function valorDePlist(xml, clave) {
  const m = xml.match(
    new RegExp(`<key>${clave}</key>\\s*(<true/>|<false/>|<string>([\\s\\S]*?)</string>|<integer>(\\d+)</integer>)`),
  );
  if (!m) return null;
  if (m[1] === '<true/>') return true;
  if (m[1] === '<false/>') return false;
  return m[2] ?? m[3];
}

// ─────────────────────────────────────────────────────────────────────────────

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) {
  console.error('Uso: node herramientas/artefacto-ios.mjs ruta/al/app.ipa');
  process.exit(2);
}

console.log(`Midiendo el IPA que se distribuiria: ${ruta}\n`);
const app = abrir(ruta);
const info = readFileSync(join(app, 'Info.plist'), 'utf8');

console.log('=== IDENTIDAD ===');
anotar('bundle identifier', valorDePlist(info, 'CFBundleIdentifier') === APP,
  valorDePlist(info, 'CFBundleIdentifier'));
anotar('version comercial 0.1.0', valorDePlist(info, 'CFBundleShortVersionString') === '0.1.0',
  valorDePlist(info, 'CFBundleShortVersionString'));
{
  const build = valorDePlist(info, 'CFBundleVersion');
  // Apple no admite dos subidas con el mismo `CFBundleVersion`; el 3 es el de
  // RELEASE-0 y es el primero que puede llevar el entitlement.
  anotar('build number 3', build === '3', build);
}

console.log('\n=== CIFRADO ===');
{
  const exento = valorDePlist(info, 'ITSAppUsesNonExemptEncryption');
  /*
   * Sin esta clave, App Store Connect PARA cada subida y pide una declaracion
   * a mano. Con `false` declarado, no. La app solo usa HTTPS, que es de los
   * usos exentos.
   */
  anotar('ITSAppUsesNonExemptEncryption = false', exento === false, String(exento));
}

console.log('\n=== PERMISOS ===');
{
  const claves = [...new Set([...info.matchAll(/<key>(NS\w*UsageDescription)<\/key>/g)].map((m) => m[1]))].sort();
  let bien = true;
  for (const clave of claves) {
    const admitido = PERMISOS_ADMITIDOS.find((p) => p.clave === clave);
    if (!admitido) { bien = false; console.log(`    SIN JUSTIFICAR  ${clave}`); }
    else console.log(`    pedido          ${clave}`);
  }
  for (const p of PERMISOS_ADMITIDOS) {
    if (!claves.includes(p.clave)) { bien = false; console.log(`    FALTA           ${p.clave} — ${p.porque}`); }
  }
  anotar(`permisos declarados (${claves.length})`, bien);

  const camara = valorDePlist(info, 'NSCameraUsageDescription') ?? '';
  anotar('el motivo de la camara esta en castellano y habla de carnes',
    /cámara|camara/i.test(camara) && /carn/i.test(camara), camara.slice(0, 60) + '…');
}

console.log('\n=== FIRMA Y APROVISIONAMIENTO ===');
anotar('el paquete va firmado', existsSync(join(app, '_CodeSignature', 'CodeResources')));

const provision = readFileSync(join(app, 'embedded.mobileprovision'), 'latin1');
/*
 * El `.mobileprovision` es CMS firmado por Apple, pero lleva dentro un plist
 * XML en claro. Se saca ese trozo en vez de descifrar el CMS: lo que se quiere
 * comprobar es el CONTENIDO, y la firma ya la valida Apple al instalar.
 */
const inicio = provision.indexOf('<?xml');
const fin = provision.indexOf('</plist>') + '</plist>'.length;
const perfil = provision.slice(inicio, fin);

anotar('el perfil de aprovisionamiento va embebido', inicio >= 0 && fin > inicio);
anotar('nombre del perfil', true, valorDePlist(perfil, 'Name'));
{
  const identificador = perfil.match(/<key>application-identifier<\/key>\s*<string>([^<]+)<\/string>/)?.[1] ?? '';
  const equipo = identificador.split('.')[0];
  anotar('application-identifier apunta a la app', identificador.endsWith(`.${APP}`), identificador);
  anotar('equipo de Apple', /^[A-Z0-9]{10}$/.test(equipo), equipo);
}
{
  const caduca = valorDePlist(perfil, 'ExpirationDate') ?? perfil.match(/<key>ExpirationDate<\/key>\s*<date>([^<]+)<\/date>/)?.[1];
  const fecha = caduca ? new Date(caduca) : null;
  anotar('el perfil no esta caducado', !!fecha && fecha > new Date(),
    fecha ? fecha.toISOString().slice(0, 10) : 'sin fecha');
}
{
  // En una build de tienda el depurador NO puede engancharse al proceso.
  const depurable = valorDePlist(perfil, 'get-task-allow');
  anotar('get-task-allow = false (build de tienda, no depurable)', depurable === false, String(depurable));
}

console.log('\n=== ASSOCIATED DOMAINS ===');
/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE MIRAN DOS SITIOS, Y NO DICEN LO MISMO A PROPOSITO.                    │
 * │                                                                          │
 * │ El PERFIL autoriza; la FIRMA del binario es lo que rige. En un perfil de │
 * │ App Store el entitlement va como comodin —`<string>*</string>`—, porque  │
 * │ autoriza cualquier dominio y la lista concreta se fija al firmar. Buscar │
 * │ ahi un `<array>` con el dominio da AUSENTE y parece que falta el         │
 * │ entitlement cuando esta perfectamente puesto.                            │
 * │                                                                          │
 * │ Esa confusion costo una vuelta: el instrumento decia rojo sobre un IPA   │
 * │ correcto. Lo que hay que leer es la firma del ejecutable.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
{
  const enPerfil = perfil.match(
    /<key>com\.apple\.developer\.associated-domains<\/key>\s*(<array>[\s\S]*?<\/array>|<string>[^<]*<\/string>)/,
  )?.[1];
  anotar('el perfil autoriza Associated Domains', !!enPerfil,
    enPerfil?.includes('<string>*</string>') ? 'comodin «*», que es lo normal en un perfil de tienda'
      : (enPerfil ?? 'AUSENTE'));

  /*
   * Los entitlements que de verdad rigen viajan dentro de la firma del Mach-O,
   * como un plist XML en claro. Es lo que lee el sistema al instalar, y por
   * tanto lo unico que decide si iOS ira a buscar el AASA.
   */
  const binario = readFileSync(join(app, valorDePlist(info, 'CFBundleExecutable'))).toString('latin1');
  const inicioE = binario.indexOf('<?xml');
  const finE = binario.indexOf('</plist>', inicioE);
  const firmados = inicioE >= 0 && finE > inicioE ? binario.slice(inicioE, finE + 8) : '';
  anotar('el binario lleva sus entitlements firmados', firmados.includes('application-identifier'));

  const bloque = firmados.match(
    /<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/,
  )?.[1];
  const dominios = bloque ? [...bloque.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]) : [];
  anotar('la firma declara Associated Domains', dominios.length > 0,
    dominios.join(', ') || 'AUSENTE');
  anotar(`y su valor es exactamente ${ASOCIACION}`,
    dominios.length === 1 && dominios[0] === ASOCIACION, dominios.join(', '));
  // Depurar sin querer con `applinks:` en modo permisivo desactivaria la
  // verificacion del AASA en el dispositivo.
  anotar('sin sufijo de desarrollo en el dominio',
    !dominios.some((d) => d.includes('?mode=developer')), dominios.join(', '));
}

console.log('\n=== EL PAQUETE DE JAVASCRIPT ===');
{
  const bytes = readFileSync(join(app, 'main.jsbundle'));
  const texto = bytes.toString('utf8');
  const dentro = (s) =>
    bytes.includes(Buffer.from(s, 'utf8')) || bytes.includes(Buffer.from(s, 'utf16le'));

  anotar(`apunta a ${API_DE_PRODUCCION}`, dentro(API_DE_PRODUCCION));

  const fugas = [];
  for (const { patron, porque } of PROHIBIDO) if (dentro(patron)) fugas.push(`${patron} (${porque})`);
  if (ES_UNA_URL_LOCAL(texto)) fugas.push('una URL http://192.168.x.x (la IP de la red local)');
  anotar('sin IP de la red local, sin localhost y sin vista previa',
    fugas.length === 0, fugas.join('; '));
}

console.log('\n=== RESUMEN DEL IPA ===');
for (const { nombre, verde } of pasos) console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}`);
process.exit(pasos.every((p) => p.verde) ? 0 : 1);
