import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LA RAMA DEL CONSENTIMIENTO, DE PRINCIPIO A FIN.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CUATRO SESIONES, TRES PERSONAS, Y LAS TRES CAPACIDADES DE PARITY-4.     │
 * │                                                                          │
 * │   0. la dueña rellena al responsable   (legal.update)                    │
 * │   1. la socia DA su permiso            (progreso.consentimientoDeSalud)  │
 * │   2. el entrenador registra una medida (progreso.registrar)              │
 * │   3. la socia RETIRA su permiso        (deja el permiso como estaba)     │
 * │                                                                          │
 * │ El paso 0 no es preparacion administrativa: sin identidad del            │
 * │ responsable el documento de privacidad NO se publica, y sin documento    │
 * │ publicado la socia no tiene nada que consentir. Es la cadena real.       │
 * │                                                                          │
 * │ El recorrido normal de `entrenador.yaml` cae en la otra rama —sin        │
 * │ consentimiento— y comprueba que se explica QUE falta y A QUIEN le toca.  │
 * │ Las dos ramas son correctas; las dos hay que verlas.                     │
 * │                                                                          │
 * │ DOS COSAS NO SE DESHACEN, Y ES A PROPOSITO:                              │
 * │   · la medicion registrada, que es el rastro de que se registro de       │
 * │     verdad — borrarla seria borrar la prueba;                            │
 * │   · el documento de privacidad publicado, que por diseño no se despublica│
 * │     (es aquello contra lo que alguien consintio).                        │
 * │ Los dos, en la base de datos de DESARROLLO.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/desarrollo/medicion.mjs
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..', '..');
const RAIZ = resolve(MOVIL, '..', '..');
const FLUJOS = join(AQUI, 'flujos');
const CREDENCIALES = join(RAIZ, 'apps', 'web', 'auditoria', 'credenciales.local.json');
const MAESTRO = 'C:/as/maestro/maestro/bin/maestro.bat';
const ADB = 'C:/as/sdk/platform-tools/adb.exe';
const JDK = 'C:/as/jdk/jdk-17.0.20.1+1';
const API = 'http://localhost:3001/v1';

/** El cerrojo de siempre: esto no habla con produccion. */
if (!API.startsWith('http://localhost:')) throw new Error(`API no local: ${API}`);
if (!execFileSync(ADB, ['reverse', '--list'], { encoding: 'utf8' }).includes('tcp:3001')) {
  throw new Error('falta `adb reverse tcp:3001 tcp:3001`');
}

const fixture = JSON.parse(readFileSync(CREDENCIALES, 'utf8'));
const claves = Object.values(fixture.cuentas).map((c) => c.clave);
/** Ninguna clave del fixture llega a la consola. */
const limpiar = (texto) =>
  claves.reduce((t, clave) => t.split(clave).join('<clave oculta>'), texto ?? '');

/**
 * Un argumento `-e` para Maestro, entrecomillado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN LAS COMILLAS, UN VALOR CON ESPACIOS SE PARTE EN DOS.                 │
 * │                                                                          │
 * │ Maestro es un `.bat`, asi que hay que lanzarlo por el interprete de      │
 * │ ordenes. `-e TITULO=NO PASA` llegaba como `-e TITULO=NO` y `PASA`, y     │
 * │ Maestro entendia `PASA` como un SEGUNDO flujo: «Flow path does not       │
 * │ exist: flujos\PASA». Con `JSON.stringify` va entero y ademas protege el │
 * │ `^` de los anclajes, que el interprete se comeria.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const argumento = (clave, valor) => JSON.stringify(`${clave}=${valor}`);

function unaVez(flujo, cuenta, extra = {}) {
  const args = ['test', join(FLUJOS, flujo), '-e', argumento('CORREO', cuenta.email), '-e', argumento('CLAVE', cuenta.clave)];
  for (const [k, v] of Object.entries(extra)) args.push('-e', argumento(k, v));
  const r = spawnSync(MAESTRO, args, {
    cwd: FLUJOS,
    env: { ...process.env, JAVA_HOME: JDK },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  console.log(limpiar(r.stdout).split('\n').slice(-25).join('\n'));
  if (r.status !== 0 && r.stderr?.trim()) {
    console.error(limpiar(r.stderr).split('\n').slice(-10).join('\n'));
  }
  return r.status === 0;
}

/**
 * El mismo flujo, con UN reintento.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNO, Y SOLO PORQUE EL ARRANQUE DEL EMULADOR NO ES DETERMINISTA.          │
 * │                                                                          │
 * │ Cada recorrido empieza borrando los datos de la app y vuelve a bajar      │
 * │ ~1800 modulos por el puente de adb; a veces la hoja del menu de           │
 * │ desarrollo llega tarde y tapa la pantalla de entrada. Eso es ruido del    │
 * │ banco de pruebas, no del producto.                                        │
 * │                                                                          │
 * │ UN reintento y se acabo: con dos o tres, un fallo de verdad —uno que      │
 * │ falla seis de cada diez veces— acabaria saliendo verde.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function maestro(...args) {
  if (unaVez(...args)) return true;
  console.log("  (el flujo fallo; se repite UNA vez por si fue el arranque)");
  return unaVez(...args);
}

const duena = fixture.cuentas.owner;
const socia = fixture.cuentas.member;
const entrenador = fixture.cuentas.trainer;
const pasos = [];

console.log('\n=== 0/4 — LA DUEÑA RELLENA LOS DATOS DEL RESPONSABLE ===');
pasos.push(['la dueña rellena los datos del responsable', maestro('legal.yaml', duena)]);

let dado = false;
if (pasos[pasos.length - 1][1]) {
  console.log('\n=== 1/4 — LA SOCIA DA SU PERMISO ===');
  dado = maestro('consentimiento.yaml', socia, { ACCION: 'dar' });
  pasos.push(['la socia da su permiso', dado]);
}

if (dado) {
  console.log('\n=== 2/4 — EL ENTRENADOR REGISTRA UNA MEDICIÓN ===');
  pasos.push(['el entrenador registra una medición', maestro('entrenador-medicion.yaml', entrenador)]);
}

/*
 * La retirada corre aunque la MEDICION haya fallado —dejar el permiso dado
 * cambiaria el fixture para el siguiente que ejecute los recorridos—, pero
 * no si el permiso nunca llego a darse: retirar lo que no existe solo produce
 * un rojo que no significa nada y tapa el fallo de verdad.
 */
if (dado) {
  console.log('\n=== 3/4 — LA SOCIA RETIRA SU PERMISO ===');
  pasos.push([
    'la socia retira su permiso',
    maestro('consentimiento.yaml', socia, { ACCION: 'retirar' }),
  ]);
} else {
  console.log('\n=== 3/4 — nada que retirar: el permiso no llego a darse ===');
}

console.log('\n=== RESUMEN ===');
for (const [nombre, verde] of pasos) console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}`);
process.exit(pasos.every(([, verde]) => verde) ? 0 : 1);
