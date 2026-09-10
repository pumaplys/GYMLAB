import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Que en un artefacto de PRODUCCION no viaje ninguna direccion de desarrollo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO EXISTE PORQUE UN `expo export` LOCAL SI LLEVA LA IP DE CASA.        │
 * │                                                                          │
 * │ `apps/mobile/.env` —que esta en .gitignore y solo existe en el ordenador │
 * │ de quien desarrolla— apunta a `http://192.168.x.x:3001/v1`, porque desde │
 * │ un telefono `localhost` no vale. Y `expo export` lo carga. Se comprobo   │
 * │ mirando el paquete: la IP estaba dentro.                                 │
 * │                                                                          │
 * │ En EAS no pasa: `.env` no viaja al servidor y el perfil de build declara │
 * │ `EXPO_PUBLIC_API_URL` en el entorno de EAS. Pero «no pasa» hay que       │
 * │ MEDIRLO, no suponerlo, y por eso esto exporta con el entorno de          │
 * │ produccion y mira los bytes.                                             │
 * │                                                                          │
 * │ Y aunque se colara: `src/api/config.ts` rechaza en release toda URL de   │
 * │ desarrollo y cae al dominio de produccion. Son dos defensas, no una.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/artefacto-de-produccion.mjs            exporta y mide
 *   node herramientas/artefacto-de-produccion.mjs app.aab    mide LO QUE SE SUBE
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA SEGUNDA FORMA EXISTE PORQUE LA PRIMERA MIDE UN SUSTITUTO.             │
 * │                                                                          │
 * │ Exportar con el entorno de produccion se parece mucho a lo que hace EAS, │
 * │ pero no es el mismo fichero: a Play sube un `.aab` que ha construido     │
 * │ otra maquina. Pasandole la ruta del AAB se miran los bytes que de verdad │
 * │ viajan, y ademas los permisos que declara su manifiesto.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..');
const DESTINO = join(MOVIL, '.expo', 'produccion');

export const API_DE_PRODUCCION = 'https://gymlabfit.tech/v1';

/** Lo que NO puede estar. Cada patron dice de donde saldria si estuviera. */
const PROHIBIDO = [
  { patron: 'vista-previa.invalid', porque: 'la vista previa web se colo en el binario' },
  { patron: '192.168.', porque: 'la IP de la red local de quien desarrolla' },
  { patron: '10.0.2.2', porque: 'la puerta del emulador de Android' },
  { patron: 'localhost:3001', porque: 'la API de desarrollo' },
];

/*
 * `192.168.` aparece ADEMAS dentro de `esDeDesarrollo`, que es una defensa y no
 * una fuga: su expresion regular enumera las franjas privadas. Se distingue por
 * el contexto — una URL completa lleva esquema y puerto.
 */
const ES_UNA_URL = (texto) => /https?:\/\/[^\s"']*192\.168\./.test(texto);

/**
 * Los permisos que se admiten en el manifiesto del binario, y por que.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LISTA ESCRITA A MANO. NADA SE EXIME SOLO.                                │
 * │                                                                          │
 * │ Un permiso que aparezca y no este aqui pone esto en rojo, aunque venga   │
 * │ de una libreria: que lo traiga una dependencia no lo hace aceptable, lo  │
 * │ hace algo que hay que mirar y decidir. Es la misma leccion del gate de   │
 * │ aislamiento, donde eximir por parecido dejo pasar una fuga plantada.     │
 * │                                                                          │
 * │ `pedido` distingue lo que la app SOLICITA de lo que solo usa como        │
 * │ candado en un componente suyo: `BIND_JOB_SERVICE` y `DUMP` aparecen en   │
 * │ `android:permission=` de un servicio y un receptor, es decir, exigen ESE │
 * │ permiso a quien llame. No se le piden a nadie.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const PERMISOS_ADMITIDOS = [
  { nombre: 'android.permission.CAMERA', pedido: true, porque: 'el escaner de carnes de la puerta' },
  { nombre: 'android.permission.INTERNET', pedido: true, porque: 'hablar con la API' },
  {
    nombre: 'android.permission.ACCESS_NETWORK_STATE',
    pedido: true,
    porque:
      'lo inyecta expo-camera -> androidx.camera:camera-video -> media3. Es de nivel normal: ' +
      'no se pregunta al usuario, no da acceso a ningun dato suyo y Play no lo enseña. No se ' +
      'bloquea porque bloquear a ciegas algo que una libreria del escaner declara es arriesgar ' +
      'el escaner para no ganar nada',
  },
  {
    nombre: 'android.permission.BIND_JOB_SERVICE',
    pedido: false,
    porque: 'candado del JobService de datatransport: lo exige AL SISTEMA para poder invocarlo',
  },
  {
    nombre: 'android.permission.DUMP',
    pedido: false,
    porque: 'candado del ProfileInstallReceiver de androidx: lo exige a quien le mande un intent',
  },
];

function construir() {
  console.log('Exportando con el entorno de PRODUCCION…');
  const cli = createRequire(join(MOVIL, 'package.json')).resolve('expo/bin/cli');
  execFileSync(
    process.execPath,
    [cli, 'export', '--platform', 'android', '--clear', '--output-dir', DESTINO],
    {
      cwd: MOVIL,
      stdio: 'inherit',
      // Se pone AQUI y no en un `.env`: lo que se mide es el artefacto que
      // sale con la variable de produccion, no el que salga hoy en este PC.
      env: { ...process.env, EXPO_PUBLIC_API_URL: API_DE_PRODUCCION },
    },
  );
}

function ficheros(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ficheros(p, acc);
    else acc.push(p);
  }
  return acc;
}

function comprobar(explicitas) {
  const partes = explicitas ?? ficheros(DESTINO).filter((f) => /\.(js|hbc)$/.test(f));
  if (partes.length === 0) throw new Error('no hay ningun paquete que mirar');
  const bytes = partes.map((f) => readFileSync(f));
  const texto = bytes.map((b) => b.toString('utf8')).join('\n');

  const dentro = (s) =>
    bytes.some((b) => b.includes(Buffer.from(s, 'utf8')) || b.includes(Buffer.from(s, 'utf16le')));

  if (!dentro(API_DE_PRODUCCION)) {
    throw new Error(`el paquete NO apunta a ${API_DE_PRODUCCION}`);
  }
  console.log(`\nApunta a ${API_DE_PRODUCCION}.`);

  const fugas = [];
  for (const { patron, porque } of PROHIBIDO) {
    if (!dentro(patron)) continue;
    // La franja privada dentro de `esDeDesarrollo` no cuenta; una URL, si.
    if (patron === '192.168.' && !ES_UNA_URL(texto)) continue;
    fugas.push(`${patron} — ${porque}`);
  }

  if (fugas.length > 0) {
    console.error('\nFUGAS EN EL ARTEFACTO DE PRODUCCION:');
    for (const f of fugas) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('Sin IP de la red local, sin localhost y sin vista previa.');
}

/**
 * Saca de un `.aab` o un `.apk` el paquete de JavaScript y el manifiesto.
 *
 * Se usa `tar`, que en Windows 10 en adelante es bsdtar y lee zip; si no
 * estuviera, `unzip`. Sin dependencias nuevas para leer un zip.
 */
function abrirBinario(ruta) {
  const fuera = join(MOVIL, '.expo', 'artefacto');
  rmSync(fuera, { recursive: true, force: true });
  mkdirSync(fuera, { recursive: true });

  const DENTRO = ['base/assets/index.android.bundle', 'base/manifest/AndroidManifest.xml'];
  try {
    execFileSync('tar', ['-xf', resolve(ruta), '-C', fuera, ...DENTRO], { stdio: 'pipe' });
  } catch {
    execFileSync('unzip', ['-q', '-o', resolve(ruta), ...DENTRO, '-d', fuera], { stdio: 'pipe' });
  }
  return {
    paquete: join(fuera, 'base', 'assets', 'index.android.bundle'),
    manifiesto: join(fuera, 'base', 'manifest', 'AndroidManifest.xml'),
  };
}

/** Los permisos del manifiesto, contra la lista escrita a mano. */
function comprobarPermisos(manifiesto) {
  /*
   * El manifiesto de un AAB es protobuf, no XML binario, y `aapt2` de las
   * build-tools no lo lee con `dump xmltree`. Pero los nombres de permiso van
   * como texto plano dentro, asi que se leen tal cual. Es deliberadamente
   * TOSCO: no distingue `uses-permission` de `android:permission=`, y por eso
   * la lista de admitidos lleva ese dato escrito a mano.
   */
  const texto = readFileSync(manifiesto).toString('latin1');
  const encontrados = [...new Set([...texto.matchAll(/android\.permission\.[A-Z_]+/g)].map((m) => m[0]))].sort();

  console.log('\nPermisos nombrados en el manifiesto del binario:');
  const intrusos = [];
  for (const nombre of encontrados) {
    const admitido = PERMISOS_ADMITIDOS.find((p) => p.nombre === nombre);
    if (!admitido) {
      intrusos.push(nombre);
      console.log(`  SIN JUSTIFICAR  ${nombre}`);
      continue;
    }
    console.log(`  ${admitido.pedido ? 'pedido ' : 'candado'}  ${nombre}`);
  }

  const faltan = PERMISOS_ADMITIDOS.filter((p) => p.pedido && !encontrados.includes(p.nombre));
  if (faltan.length > 0) {
    console.error('\nFALTAN permisos que la app necesita:');
    for (const p of faltan) console.error(`  ${p.nombre} — ${p.porque}`);
  }

  if (intrusos.length > 0) {
    console.error('\nPERMISOS SIN JUSTIFICAR EN EL BINARIO:');
    for (const n of intrusos) console.error(`  ${n}`);
    console.error('Decide si hace falta y anadelo a PERMISOS_ADMITIDOS con su motivo, o bloquealo.');
  }

  return intrusos.length === 0 && faltan.length === 0;
}

const binario = process.argv[2];
if (binario) {
  console.log(`Midiendo el binario que se sube: ${binario}`);
  const { paquete, manifiesto } = abrirBinario(binario);
  const permisosBien = comprobarPermisos(manifiesto);
  comprobar([paquete]);
  if (!permisosBien) process.exit(1);
} else {
  construir();
  comprobar();
}
