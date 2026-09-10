import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Los recorridos autenticados de Android, contra DESARROLLO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CLAVE DEL FIXTURE NO SE IMPRIME EN NINGUN SITIO.                     │
 * │                                                                          │
 * │ Sale de `apps/web/auditoria/credenciales.local.json` —gitignored— y va a │
 * │ Maestro por `-e`. Maestro la repetiria en su registro al teclearla, asi  │
 * │ que TODA su salida pasa por un filtro que la sustituye antes de que      │
 * │ llegue a la consola. No es cosmetico: es la unica forma de automatizar   │
 * │ un login sin que la credencial acabe en un informe.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/desarrollo/recorridos.mjs [rol...]
 *
 * Requiere: emulador arrancado, API local en :3001 y `adb reverse tcp:3001`.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..', '..');
const RAIZ = resolve(MOVIL, '..', '..');
const FLUJOS = join(AQUI, 'flujos');
const CREDENCIALES = join(RAIZ, 'apps', 'web', 'auditoria', 'credenciales.local.json');
const MAESTRO = 'C:/as/maestro/maestro/bin/maestro.bat';
const ADB = 'C:/as/sdk/platform-tools/adb.exe';

const API = 'http://localhost:3001/v1';
/** Maestro es una JVM: sin esto no arranca. */
const JDK = 'C:/as/jdk/jdk-17.0.20.1+1';

/** Cerrojo: esto no habla con produccion, y se comprueba antes de nada. */
function comprobarQueEsDesarrollo() {
  if (!API.startsWith('http://localhost:')) throw new Error(`API no local: ${API}`);
  const salida = execFileSync(ADB, ['reverse', '--list'], { encoding: 'utf8' });
  if (!salida.includes('tcp:3001')) {
    throw new Error('falta `adb reverse tcp:3001 tcp:3001`: la app no llegaria a la API local');
  }
}

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

const ROLES = ['member', 'owner', 'receptionist', 'trainer'];
const FLUJO_DE = {
  member: 'socio.yaml',
  owner: 'dueno.yaml',
  receptionist: 'recepcion.yaml',
  trainer: 'entrenador.yaml',
};

comprobarQueEsDesarrollo();

const fixture = JSON.parse(readFileSync(CREDENCIALES, 'utf8'));
const pedidos = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ROLES;
const resultados = [];

for (const rol of pedidos) {
  const cuenta = fixture.cuentas[rol];
  if (!cuenta) throw new Error(`el fixture no tiene cuenta de ${rol}`);
  const flujo = join(FLUJOS, FLUJO_DE[rol]);
  if (!existsSync(flujo)) throw new Error(`falta el flujo ${flujo}`);

  // El filtro. Antes de imprimir NADA.
  const limpiar = (texto) => (texto ?? '').split(cuenta.clave).join('<clave oculta>');

  const unaVez = () => {
    const r = spawnSync(
      MAESTRO,
      ['test', flujo, '-e', argumento('CORREO', cuenta.email), '-e', argumento('CLAVE', cuenta.clave)],
      {
        cwd: FLUJOS,
        env: { ...process.env, JAVA_HOME: JDK },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        shell: true,
      },
    );
    console.log(limpiar(r.stdout).split('\n').slice(-40).join('\n'));
    if (r.stderr?.trim()) console.error(limpiar(r.stderr).split('\n').slice(-15).join('\n'));
    return r.status;
  };

  console.log(`\n=== ${rol.toUpperCase()} — ${cuenta.email} ===`);
  /*
   * UN reintento, y solo porque el arranque del emulador no es determinista:
   * cada recorrido borra los datos de la app y vuelve a bajar ~1800 modulos
   * por el puente de adb, y a veces la hoja del menu de desarrollo llega tarde
   * y tapa la pantalla de entrada. Con dos o tres reintentos, un fallo de
   * verdad —uno que falla seis de cada diez veces— acabaria saliendo verde.
   */
  let codigo = unaVez();
  if (codigo !== 0) {
    console.log('  (el recorrido fallo; se repite UNA vez por si fue el arranque)');
    codigo = unaVez();
  }
  resultados.push({ rol, codigo });
}

console.log('\n=== RESUMEN ===');
for (const { rol, codigo } of resultados) {
  console.log(`  ${rol.padEnd(14)} ${codigo === 0 ? 'VERDE' : `ROJO (${codigo})`}`);
}
process.exit(resultados.every((r) => r.codigo === 0) ? 0 : 1);
