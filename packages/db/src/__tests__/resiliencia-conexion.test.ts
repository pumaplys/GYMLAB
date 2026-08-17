import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../client';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE TEST EXISTE PORQUE SU AUSENCIA MATO LA API EN PRODUCCION LOCAL.     │
 * │                                                                          │
 * │ El pool de `pg` es un `EventEmitter`. Un `'error'` emitido SIN listener  │
 * │ registrado se convierte en excepcion no capturada y TERMINA EL PROCESO.  │
 * │ Y estas conexiones se caen estando ociosas, asi que no hay `try/catch`   │
 * │ en ningun sitio que pueda recogerlo.                                     │
 * │                                                                          │
 * │ Reproducido parando Postgres con la API en marcha: murio en dos segundos │
 * │ con codigo 57P01 —lo que Postgres envia en cualquier reinicio—.          │
 * │                                                                          │
 * │ El listener de `client.ts` es una linea facil de borrar por "limpieza",  │
 * │ y su ausencia no rompe ningun test funcional: todo sigue verde hasta que │
 * │ la base de datos se reinicia un martes por la noche.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * No hace falta base de datos: `new Pool()` no conecta hasta la primera
 * consulta, y lo que se comprueba es el cableado de eventos.
 */
describe('resiliencia del pool', () => {
  const opciones = { connectionString: 'postgres://nadie@127.0.0.1:1/vacio' };

  it('registra un listener de error en el pool', () => {
    const db = createDatabase(opciones);

    expect(db.$client.listenerCount('error')).toBeGreaterThan(0);
  });

  it('una conexion ociosa perdida se registra y NO tumba el proceso', () => {
    const db = createDatabase(opciones);
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});

    /*
     * Emitir `'error'` a mano es exactamente lo que hace `pg` cuando se cae una
     * conexion ociosa. Si nadie escucha, esta linea LANZA y el test falla — que
     * es justo el fallo que se quiere detectar.
     */
    expect(() => {
      db.$client.emit('error', new Error('terminating connection due to administrator command'));
    }).not.toThrow();

    expect(consola).toHaveBeenCalled();
    // El mensaje tiene que llegar al log: un listener silencioso deja el mismo
    // corte sin rastro y no sirve para diagnosticar nada.
    expect(String(consola.mock.calls[0])).toContain('terminating connection');

    consola.mockRestore();
  });
});
