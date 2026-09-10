import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
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
 *   node herramientas/artefacto-de-produccion.mjs
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

function comprobar() {
  const partes = ficheros(DESTINO).filter((f) => /\.(js|hbc)$/.test(f));
  if (partes.length === 0) throw new Error('la exportacion no ha dejado ningun paquete');
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

construir();
comprobar();
