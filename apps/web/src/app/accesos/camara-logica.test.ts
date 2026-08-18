import { describe, expect, it, vi } from 'vitest';
import {
  arrancar,
  elegirLector,
  soltarStream,
  type EntornoDeArranque,
  type EntornoDeLectura,
} from './camara-logica';

/**
 * ESTO NO PRUEBA UNA CAMARA. Prueba que llamamos a lo que hay que llamar.
 *
 * Que un sensor fisico se apague no lo puede comprobar CI. Lo que si se
 * comprueba —y es donde estaba el riesgo— es que se detiene CADA pista, que no
 * se abre una segunda camara sin cerrar la primera, y que un permiso denegado
 * deja la pantalla utilizable.
 */

const pista = () => ({ stop: vi.fn() });
const streamCon = (n: number) => {
  const pistas = Array.from({ length: n }, pista);
  return { stream: { getTracks: () => pistas }, pistas };
};

const jsqrQueLee = (texto: string | null) =>
  vi.fn().mockResolvedValue(() => (texto === null ? null : { data: texto }));

const lienzoQuePinta = () => ({
  pintar: () => ({ datos: new Uint8ClampedArray(4), ancho: 1, alto: 1 }),
});

const entornoBase = (): EntornoDeLectura => ({
  detectorNativo: null,
  cargarJsqr: jsqrQueLee('token-leido'),
  crearLienzo: lienzoQuePinta,
});

describe('soltar la camara', () => {
  it('detiene TODAS las pistas, no solo la primera', () => {
    // Un stream de video puede traer mas de una. Dejar una viva mantiene el
    // indicador del dispositivo encendido.
    const { stream, pistas } = streamCon(3);

    soltarStream(stream);

    for (const p of pistas) expect(p.stop).toHaveBeenCalledTimes(1);
  });

  it('sin stream no revienta', () => {
    // Pasa al desmontar sin haber encendido nunca la camara.
    expect(() => soltarStream(null)).not.toThrow();
  });
});

describe('elegir como se lee', () => {
  it('con BarcodeDetector usa el nativo y NO descarga jsqr', async () => {
    const cargarJsqr = vi.fn();
    const detect = vi.fn().mockResolvedValue([{ rawValue: 'del-nativo' }]);

    const lector = await elegirLector({
      detectorNativo: () => ({ detect }),
      cargarJsqr,
      crearLienzo: lienzoQuePinta,
    });

    expect(lector?.modo).toBe('nativo');
    expect(await lector?.leer({})).toBe('del-nativo');
    // Lo que evita que Chrome descargue el respaldo sin necesitarlo.
    expect(cargarJsqr).not.toHaveBeenCalled();
  });

  it('sin BarcodeDetector cae a jsqr', async () => {
    const entorno = entornoBase();

    const lector = await elegirLector(entorno);

    expect(lector?.modo).toBe('jsqr');
    expect(await lector?.leer({})).toBe('token-leido');
    expect(entorno.cargarJsqr).toHaveBeenCalledTimes(1);
  });

  it('si jsqr NO se puede descargar, la pantalla no se rompe', async () => {
    /*
     * Sin red o con el fichero ausente. Devuelve null —que la pantalla traduce
     * a «no soportada»— en lugar de lanzar y dejar el escaner en blanco.
     */
    const lector = await elegirLector({
      ...entornoBase(),
      cargarJsqr: vi.fn().mockRejectedValue(new Error('sin red')),
    });

    expect(lector).toBeNull();
  });

  it('sin lienzo tampoco lanza', async () => {
    const lector = await elegirLector({ ...entornoBase(), crearLienzo: () => null });

    expect(lector).toBeNull();
  });

  it('un fotograma sin codigo devuelve null, no una cadena vacia', async () => {
    // El bucle llama a esto muchas veces por segundo: distinguir «nada» de
    // «cadena vacia» es lo que impide enviar basura al servidor.
    const lector = await elegirLector({ ...entornoBase(), cargarJsqr: jsqrQueLee(null) });

    expect(await lector?.leer({})).toBeNull();
  });
});

describe('arrancar la camara', () => {
  const arranque = (over: Partial<EntornoDeArranque> = {}): EntornoDeArranque => ({
    ...entornoBase(),
    streamAnterior: null,
    pedirCamara: vi.fn().mockResolvedValue(streamCon(1).stream),
    ...over,
  });

  it('enciende y dice con que lector', async () => {
    const resultado = await arrancar(arranque());

    expect(resultado.estado).toBe('encendida');
    if (resultado.estado === 'encendida') expect(resultado.lector.modo).toBe('jsqr');
  });

  it('CIERRA la camara anterior ANTES de pedir otra', async () => {
    /*
     * Es el fallo que deja la camara ocupada para siempre: dos streams vivos,
     * indicador encendido, y en algunos dispositivos la segunda peticion falla
     * porque el sensor ya esta en uso.
     */
    const anterior = streamCon(2);
    let pistasVivasAlPedir = -1;

    await arrancar(
      arranque({
        streamAnterior: anterior.stream,
        pedirCamara: vi.fn().mockImplementation(() => {
          pistasVivasAlPedir = anterior.pistas.filter((p) => p.stop.mock.calls.length === 0).length;
          return Promise.resolve(streamCon(1).stream);
        }),
      }),
    );

    // Cuando se pide la nueva, la anterior ya estaba cerrada del todo.
    expect(pistasVivasAlPedir).toBe(0);
    for (const p of anterior.pistas) expect(p.stop).toHaveBeenCalled();
  });

  it('permiso denegado deja un estado utilizable, no una excepcion', async () => {
    const resultado = await arrancar(
      arranque({ pedirCamara: vi.fn().mockRejectedValue(new Error('NotAllowedError')) }),
    );

    expect(resultado.estado).toBe('denegada');
  });

  it('con el permiso denegado tampoco se queda la camara anterior abierta', async () => {
    const anterior = streamCon(2);

    await arrancar(
      arranque({
        streamAnterior: anterior.stream,
        pedirCamara: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
      }),
    );

    for (const p of anterior.pistas) expect(p.stop).toHaveBeenCalled();
  });

  it('sin forma de leer no llega a pedir la camara', async () => {
    // Pedir permiso para una camara que no se va a poder usar seria pedirle
    // algo a alguien para nada.
    const pedirCamara = vi.fn();

    const resultado = await arrancar(
      arranque({ cargarJsqr: vi.fn().mockRejectedValue(new Error('sin red')), pedirCamara }),
    );

    expect(resultado.estado).toBe('no-soportada');
    expect(pedirCamara).not.toHaveBeenCalled();
  });
});
