/**
 * RESOLUCION DEL fileId DE UNA COPIA EN B2
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO ES LO QUE DECIDE SI UNA COPIA SE PUEDE SENALAR MESES DESPUES.      │
 * │                                                                          │
 * │ El `fileId` es lo unico que identifica sin ambiguedad un objeto de B2:   │
 * │ el nombre puede repetirse y de hecho se repitio —tres copias el mismo    │
 * │ dia en #76—. Si este resolutor eligiera la version equivocada, el log    │
 * │ de la copia apuntaria a otro fichero y nadie lo sabria hasta intentar    │
 * │ restaurar.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se ejecuta el script REAL con fixtures por la entrada estandar, sin tocar B2.
 * En produccion el CLI de B2 devuelve exactamente esta forma de JSON.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve(process.cwd(), '../../docker/b2-file-id.py');

/**
 * En el VPS hay `python3` —comprobado durante #76—, y CI corre en Linux, que
 * tambien lo trae. En Windows suele haber solo el alias del Store, que no
 * ejecuta nada: ahi se salta con un mensaje en vez de fallar.
 */
function hayPython(): boolean {
  const r = spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === '1';
}

function resolver(json: string, nombre: string): string {
  return execFileSync('python3', [script, nombre], { input: json, encoding: 'utf8' }).trim();
}

const OBJETIVO = 'predeploy/gymlab-2026-08-18T171532Z-5d3f20a.sql.gz.age';

const version = (over: Record<string, unknown> = {}) => ({
  fileName: OBJETIVO,
  fileId: '4_zVIEJO',
  action: 'upload',
  uploadTimestamp: 1_000,
  size: 21_611,
  ...over,
});

describe.skipIf(!hayPython())('fileId de una copia', () => {
  it('devuelve el fileId cuando hay una sola version', () => {
    expect(resolver(JSON.stringify([version()]), OBJETIVO)).toBe('4_zVIEJO');
  });

  it('elige la version MAS RECIENTE, no la primera de la lista', () => {
    /*
     * El caso de #76: varias copias con el mismo nombre. El orden en que las
     * devuelve el CLI no esta garantizado, asi que se ordena por marca de
     * tiempo. Aqui la reciente va la PRIMERA para que un `[0]` ingenuo pase
     * por casualidad y la ordenacion sea lo que de verdad se comprueba.
     */
    const json = JSON.stringify([
      version({ fileId: '4_zMEDIO', uploadTimestamp: 2_000 }),
      version({ fileId: '4_zNUEVO', uploadTimestamp: 3_000, size: 26_522 }),
      version({ fileId: '4_zVIEJO', uploadTimestamp: 1_000 }),
    ]);

    expect(resolver(json, OBJETIVO)).toBe('4_zNUEVO');
  });

  it('ignora las versiones ocultas', () => {
    // `hide` es un marcador de borrado logico, no un fichero descargable.
    const json = JSON.stringify([
      version({ fileId: '4_zOCULTA', action: 'hide', uploadTimestamp: 9_000 }),
      version({ fileId: '4_zREAL', uploadTimestamp: 3_000 }),
    ]);

    expect(resolver(json, OBJETIVO)).toBe('4_zREAL');
  });

  it('coincide por nombre EXACTO, nunca por prefijo', () => {
    /*
     * Sin igualdad exacta, pedir la copia de las 17:15:32 podria devolver la
     * de otro deploy cuyo nombre empiece igual. Es el fallo mas silencioso
     * posible: un identificador valido que apunta al fichero equivocado.
     */
    const json = JSON.stringify([
      version({ fileName: `${OBJETIVO}.parcial`, fileId: '4_zOTRO', uploadTimestamp: 9_000 }),
      version({ fileName: 'predeploy/gymlab-2026-08-18T171532Z-0000000.sql.gz.age', fileId: '4_zAJENO', uploadTimestamp: 8_000 }),
      version({ fileId: '4_zBUENO', uploadTimestamp: 3_000 }),
    ]);

    expect(resolver(json, OBJETIVO)).toBe('4_zBUENO');
  });

  it('sin coincidencias no imprime nada, y NO falla', () => {
    const json = JSON.stringify([version({ fileName: 'diario/otra-cosa.age' })]);

    // Cadena vacia: quien llama lo registra como `no-resuelto`. La copia ya
    // esta subida y convertirla en fallo seria perderla por no saber su id.
    expect(resolver(json, OBJETIVO)).toBe('');
  });

  it('acepta un objeto suelto, no solo una lista', () => {
    // Segun la version del CLI, un unico resultado puede venir sin envolver.
    expect(resolver(JSON.stringify(version({ fileId: '4_zSUELTO' })), OBJETIVO)).toBe('4_zSUELTO');
  });

  it('una salida que NO es JSON no rompe la copia', () => {
    /*
     * Si el CLI cambia de formato o escribe un aviso, esto tiene que degradar
     * a «no resuelto» y salir con exito. Fallar aqui convertiria una copia
     * correcta y ya subida en un backup fallido.
     */
    const r = spawnSync('python3', [script, OBJETIVO], {
      input: 'ERROR: algo inesperado del CLI',
      encoding: 'utf8',
    });

    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('sin argumento tampoco revienta', () => {
    const r = spawnSync('python3', [script], { input: '[]', encoding: 'utf8' });

    expect(r.status).toBe(0);
  });
});
