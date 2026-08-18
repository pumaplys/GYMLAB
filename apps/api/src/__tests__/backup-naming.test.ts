/**
 * NOMBRES DE LAS COPIAS DE SEGURIDAD
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PRUEBA EL SCRIPT DE VERDAD, NO UNA COPIA DE SU LOGICA.               │
 * │                                                                          │
 * │ Reescribir en TypeScript como se construye el nombre y comprobar ESO no  │
 * │ demuestra nada: probaria la reimplementacion, y el dia que alguien toque │
 * │ el `.sh` los dos ficheros dirian cosas distintas con el test en verde.   │
 * │                                                                          │
 * │ Por eso se ejecuta `docker/backup.sh` con `BACKUP_SOLO_NOMBRES=1`, que   │
 * │ imprime los destinos y termina ANTES de tocar Postgres, B2 o pedir un    │
 * │ solo secreto. Ese modo existe para poder comprobar esto fuera del VPS.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Vive en `apps/api` por el mismo motivo que `env-cableado.test.ts`, que
 * vigila `turbo.json`: es una comprobacion transversal de infraestructura y
 * este es el paquete donde ya viven las que no son de dominio.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(process.cwd(), '../..');
const script = resolve(raiz, 'docker/backup.sh');

/**
 * Windows sin Git Bash no puede ejecutar el script.
 *
 * Se SALTA con un mensaje en lugar de fallar: CI corre en Linux y ahi si se
 * comprueba de verdad. Un test que falla por el sistema operativo de quien lo
 * ejecuta acaba desactivado, y entonces no comprueba nada en ningun sitio.
 */
function hayBash(): boolean {
  try {
    execFileSync('bash', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function nombres(modo?: string, entorno: NodeJS.ProcessEnv = {}): string[] {
  const salida = execFileSync('bash', [script, ...(modo ? [modo] : [])], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...entorno,
      BACKUP_SOLO_NOMBRES: '1',
      GYMLAB_RAIZ: raiz,
    },
  });
  return salida.trim().split('\n').filter(Boolean);
}

const sha = () =>
  execFileSync('git', ['-C', raiz, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

describe.skipIf(!hayBash())('nombres de las copias', () => {
  it('sin argumento conserva EXACTAMENTE el nombre diario de siempre', () => {
    const salida = nombres();

    // El formato historico: prefijo `diario/` y solo la fecha. Cambiarlo
    // partiria en dos la serie de copias que ya existe en B2.
    expect(salida[0]).toMatch(/^diario\/gymlab-\d{4}-\d{2}-\d{2}\.sql\.gz\.age$/);

    // Los domingos hay una segunda al prefijo semanal, y solo los domingos.
    const esDomingo = new Date().getDay() === 0;
    expect(salida).toHaveLength(esDomingo ? 2 : 1);
    if (esDomingo) {
      expect(salida[1]).toMatch(/^semanal\/gymlab-\d{4}-W\d{2}\.sql\.gz\.age$/);
    }
  });

  it('predeploy lleva prefijo propio, sello UTC al segundo y el commit', () => {
    const salida = nombres('predeploy');

    expect(salida).toHaveLength(1);
    expect(salida[0]).toMatch(
      /^predeploy\/gymlab-\d{4}-\d{2}-\d{2}T\d{6}Z-[0-9a-f]{7,}\.sql\.gz\.age$/,
    );
    expect(salida[0]).toContain(sha());
  });

  it('postdeploy solo cambia el prefijo', () => {
    const salida = nombres('postdeploy');

    expect(salida).toHaveLength(1);
    expect(salida[0]).toMatch(
      /^postdeploy\/gymlab-\d{4}-\d{2}-\d{2}T\d{6}Z-[0-9a-f]{7,}\.sql\.gz\.age$/,
    );
  });

  it('el sello es UTC, no la hora local', () => {
    /*
     * Se compara con la hora UTC real. Con la maquina en una zona distinta de
     * UTC, un sello construido con la hora local se separaria de esto y el
     * test lo cazaria — que es justo el fallo que se quiere evitar: dos copias
     * ordenadas al reves tras un cambio de horario.
     */
    const sello = /gymlab-(\d{4}-\d{2}-\d{2}T\d{6})Z-/.exec(nombres('predeploy')[0]!)![1]!;
    const ahora = new Date();
    const esperado =
      `${ahora.getUTCFullYear()}-` +
      `${String(ahora.getUTCMonth() + 1).padStart(2, '0')}-` +
      `${String(ahora.getUTCDate()).padStart(2, '0')}T` +
      `${String(ahora.getUTCHours()).padStart(2, '0')}`;

    expect(sello.startsWith(esperado)).toBe(true);
  });

  it('dos copias seguidas NO comparten nombre', () => {
    // Es el defecto que motivo todo esto: en #76 hubo tres copias el mismo dia
    // con el mismo nombre. El sello llega al segundo, asi que se fuerza uno.
    const primera = nombres('predeploy')[0];
    execFileSync('bash', ['-c', 'sleep 1.1']);
    const segunda = nombres('predeploy')[0];

    expect(segunda).not.toBe(primera);
  });

  it('un modo desconocido falla ANTES de tocar nada, con codigo 2', () => {
    let codigo: number | undefined;
    let mensaje = '';
    try {
      execFileSync('bash', [script, 'produccion-total'], {
        encoding: 'utf8',
        env: { ...process.env, GYMLAB_RAIZ: raiz },
      });
    } catch (fallo) {
      const e = fallo as { status?: number; stdout?: string; stderr?: string };
      codigo = e.status;
      mensaje = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    expect(codigo).toBe(2);
    expect(mensaje).toContain('modo desconocido');
    // Y dice cuales valen, en lugar de dejar a quien lo ejecuta adivinando.
    expect(mensaje).toContain('predeploy');
  });

  it('el modo de nombres no necesita NINGUN secreto', () => {
    /*
     * Sin `B2_BUCKET` ni `AGE_PUBLIC_KEY` tiene que funcionar igual. Si
     * fallara, significaria que el script pide los secretos ANTES de resolver
     * el nombre, y entonces esta comprobacion solo podria hacerse en el
     * servidor de produccion.
     */
    const salida = nombres('predeploy', { B2_BUCKET: '', AGE_PUBLIC_KEY: '' });

    expect(salida[0]).toContain('predeploy/');
  });
});
