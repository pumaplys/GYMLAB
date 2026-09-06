import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@gymlab/api-client';
import type { BodyMetric } from '@gymlab/contracts';
import { clasificarError } from '../auth/clasificar';
import { debeBorrarToken } from '../auth/estado';
import { laSesionYaNoVale } from '../auth/politica';
import { fechaCortaDeInstante, fechaDeInstante } from '../formato/fecha';
import { medidaVisible, serieDe, type EstadoDeCarga } from './logica';

/**
 * La ESTRATEGIA DE CARGA de Progreso.
 *
 * Se replica la secuencia del componente —una peticion, un estado, y la medida
 * DERIVADA de los datos frescos— sobre los mismos tipos que usa la pantalla.
 */

function medicion(iso: string, valores: Partial<BodyMetric> = {}): BodyMetric {
  return {
    id: `m-${iso}`,
    measuredAt: iso,
    weightKg: null,
    bodyFatPercent: null,
    chestCm: null,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    notes: null,
    consentVersion: 'v1',
    ...valores,
  } as BodyMetric;
}

const UNA = medicion('2026-08-24T08:00:00.000Z', { weightKg: 71.4, waistCm: 79 });
const OTRA = medicion('2026-07-24T08:00:00.000Z', { weightKg: 72.6 });

/** La misma secuencia que ejecuta `cargar()` en la pantalla. */
async function cargar(
  fuente: () => Promise<readonly BodyMetric[]>,
  alPerderLaSesion: () => void = () => undefined,
): Promise<EstadoDeCarga | 'sesion-invalida'> {
  try {
    return { fase: 'ok', mediciones: await fuente() };
  } catch (problema) {
    if (laSesionYaNoVale([problema])) {
      alPerderLaSesion();
      return 'sesion-invalida';
    }
    return { fase: 'fallo', mensaje: 'No pudimos cargar tu progreso.' };
  }
}

describe('cargar', () => {
  it('sin mediciones, estado vacio y NO un error', async () => {
    const estado = await cargar(async () => []);
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(estado.mediciones).toEqual([]);
    expect(medidaVisible(estado.mediciones, null)).toBeNull();
  });

  it('con una medicion hay medida que enseñar, pero no serie', async () => {
    const estado = await cargar(async () => [UNA]);
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(medidaVisible(estado.mediciones, null)).toBe('weightKg');
    expect(serieDe(estado.mediciones, 'weightKg')).toHaveLength(1);
  });

  it('con dos o mas hay serie', async () => {
    const estado = await cargar(async () => [UNA, OTRA]);
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(serieDe(estado.mediciones, 'weightKg')).toHaveLength(2);
  });
});

describe('cuando falla', () => {
  it('un 500 deja un error recuperable, sin codigos ni jerga', async () => {
    const estado = await cargar(async () => {
      throw new ApiError(500, 'Boom');
    });
    expect(estado).toEqual({ fase: 'fallo', mensaje: 'No pudimos cargar tu progreso.' });
  });

  it('un fallo de red tambien es recuperable', async () => {
    const estado = await cargar(async () => {
      throw new NetworkError('GET', '/v1/me/progress', new TypeError('failed'));
    });
    if (typeof estado === 'string' || estado.fase !== 'fallo') throw new Error('deberia fallar');
    expect(estado.fase).toBe('fallo');
  });

  it('reintentar despues de un fallo trae los datos', async () => {
    let intentos = 0;
    const fuente = async () => {
      intentos += 1;
      if (intentos === 1) throw new ApiError(500, 'Boom');
      return [UNA];
    };

    expect(await cargar(fuente)).toMatchObject({ fase: 'fallo' });
    expect(await cargar(fuente)).toEqual({ fase: 'ok', mediciones: [UNA] });
  });
});

describe('la sesion sigue mandando la politica global', () => {
  it('un 401 devuelve la decision a la sesion', async () => {
    const revisar = vi.fn();
    const estado = await cargar(async () => {
      throw new ApiError(401, 'No autorizado');
    }, revisar);

    expect(revisar).toHaveBeenCalledOnce();
    expect(estado).toBe('sesion-invalida');
  });

  it('un 500 NO cierra la sesion', async () => {
    const revisar = vi.fn();
    await cargar(async () => {
      throw new ApiError(500, 'Boom');
    }, revisar);

    expect(revisar).not.toHaveBeenCalled();
    expect(debeBorrarToken(clasificarError(new ApiError(500, 'Boom')))).toBe(false);
  });

  it('un 429 y un fallo de red tampoco', async () => {
    const revisar = vi.fn();
    await cargar(async () => {
      throw new ApiError(429, 'Too Many Requests');
    }, revisar);
    await cargar(async () => {
      throw new NetworkError('GET', '/v1/me/progress', new TypeError('failed'));
    }, revisar);

    expect(revisar).not.toHaveBeenCalled();
  });
});

describe('refrescar', () => {
  it('vuelve a pedir y se queda con lo ultimo', async () => {
    const fuente = vi
      .fn<() => Promise<readonly BodyMetric[]>>()
      .mockResolvedValueOnce([UNA, OTRA])
      .mockResolvedValueOnce([UNA]);

    await cargar(fuente);
    const segunda = await cargar(fuente);

    expect(fuente).toHaveBeenCalledTimes(2);
    if (typeof segunda === 'string' || segunda.fase !== 'ok') throw new Error('deberia cargar');
    expect(segunda.mediciones).toHaveLength(1);
  });

  it('mantiene la medida elegida si sigue teniendo datos', async () => {
    const estado = await cargar(async () => [UNA]);
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(medidaVisible(estado.mediciones, 'waistCm')).toBe('waistCm');
  });

  it('si la medida elegida se queda sin datos, vuelve sola a una que si los tenga', async () => {
    const estado = await cargar(async () => [OTRA]);
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    // OTRA solo tiene peso: la cintura ya no existe.
    expect(medidaVisible(estado.mediciones, 'waistCm')).toBe('weightKg');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `measuredAt` ES UN INSTANTE, Y AQUI SE COMPRUEBA EN TRES HUSOS.         │
 * │                                                                          │
 * │ El contrato lo declara `z.string().datetime()` en la escritura y la API  │
 * │ lo emite con `toISOString()` sobre un `timestamptz`. El dia que le toca  │
 * │ SI depende de donde este quien mira: una medicion tomada a las 00:30 en  │
 * │ Madrid es del dia 24 aunque en UTC sea todavia el 23.                    │
 * │                                                                          │
 * │ Se mueve `process.env.TZ` de verdad, y antes se comprueba que moverlo    │
 * │ sirve de algo: sin esa comprobacion, el resto seria decorativo.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HUSOS = ['UTC', 'Europe/Madrid', 'America/Los_Angeles'] as const;

function enCadaHuso(prueba: (huso: string) => void) {
  const original = process.env.TZ;
  try {
    for (const huso of HUSOS) {
      process.env.TZ = huso;
      prueba(huso);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe('las fechas de Progreso son instantes, no dias del calendario', () => {
  it('mover TZ cambia de verdad la hora local (si no, lo demas no prueba nada)', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const enUtc = new Date('2026-08-24T02:00:00.000Z').getHours();
      process.env.TZ = 'America/Los_Angeles';
      const enLosAngeles = new Date('2026-08-24T02:00:00.000Z').getHours();
      expect(enUtc).not.toBe(enLosAngeles);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('un instante de madrugada cae en el dia LOCAL de quien mira', () => {
    const iso = '2026-08-25T02:00:00.000Z';
    const esperado: Record<string, string> = {
      UTC: '25 ago 2026',
      'Europe/Madrid': '25 ago 2026',
      // Las 19:00 del dia 24 en la costa oeste.
      'America/Los_Angeles': '24 ago 2026',
    };
    enCadaHuso((huso) => {
      expect(fechaDeInstante(iso), huso).toBe(esperado[huso]);
    });
  });

  it('la fecha corta del grafico usa el mismo dia local', () => {
    const iso = '2026-08-25T02:00:00.000Z';
    const esperado: Record<string, string> = {
      UTC: '25 ago',
      'Europe/Madrid': '25 ago',
      'America/Los_Angeles': '24 ago',
    };
    enCadaHuso((huso) => {
      expect(fechaCortaDeInstante(iso), huso).toBe(esperado[huso]);
    });
  });

  it('el orden de la serie NO depende del huso: se ordena por instante', () => {
    const datos = [
      medicion('2026-08-25T02:00:00.000Z', { weightKg: 71 }),
      medicion('2026-08-24T23:00:00.000Z', { weightKg: 72 }),
    ];
    enCadaHuso((huso) => {
      expect(serieDe(datos, 'weightKg').map((p) => p.valor), huso).toEqual([72, 71]);
    });
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE ESTA PANTALLA NO PUEDE HACER, COMPROBADO EN EL CODIGO FUENTE.    │
 * │                                                                          │
 * │ Son datos de salud. Lo que se protege no es el resultado de una funcion, │
 * │ es que NO EXISTA cierto codigo: ni un color que valore un cambio, ni una │
 * │ palabra que lo interprete, ni un objetivo que nadie ha fijado.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RAIZ = join(__dirname, '..', '..');

function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const FUENTES = [
  'app/(socio)/progreso.tsx',
  'src/progreso/logica.ts',
  'src/componentes/grafico-de-progreso.tsx',
  'src/componentes/selector-de-metrica.tsx',
].map((relativo) => {
  const bruto = readFileSync(join(RAIZ, relativo), 'utf8');
  return { relativo, codigo: bruto, sinComentar: sinComentarios(bruto) };
});

describe('Progreso no interpreta salud', () => {
  it('no usa el verde ni el rojo del tema para valorar un cambio', () => {
    for (const { relativo, sinComentar } of FUENTES) {
      expect(sinComentar, relativo).not.toMatch(/color\.exito|color\.peligro/);
    }
  });

  it('no inventa objetivos, pesos ideales ni valoraciones', () => {
    // `meta` a secas NO entra: `tema.texto.meta` es el token tipografico del
    // sistema y saltaba en cada estilo. Se busca la palabra del producto.
    const prohibidas =
      /objetivo|ideal|\bimc\b|racha|calorias|pasos\b|enhorabuena|felicidades|puntuacion/i;
    for (const { relativo, sinComentar } of FUENTES) {
      expect(sinComentar, relativo).not.toMatch(prohibidas);
    }
  });

  it('ninguna cadena de interfaz valora el cambio', () => {
    const prohibidas = /(vas |has )(muy )?(bien|mejor|genial)|mejorando|empeorando/i;
    for (const { relativo, sinComentar } of FUENTES) {
      const cadenas = sinComentar.match(/>[^<>{}]*[a-zA-Z][^<>{}]*</g) ?? [];
      for (const cadena of cadenas) {
        expect(cadena, `${relativo}: ${cadena}`).not.toMatch(prohibidas);
      }
    }
  });
});

describe('Progreso usa la politica de sesion compartida', () => {
  const pantalla = FUENTES.find((f) => f.relativo === 'app/(socio)/progreso.tsx')!;

  it('pregunta con `laSesionYaNoVale`, no con una comprobacion a mano', () => {
    expect(pantalla.sinComentar).toMatch(/laSesionYaNoVale\(\[problema\]\)/);
    expect(pantalla.sinComentar).not.toMatch(/clasificarError/);
  });

  it('delega en `revisar` y no borra token ni navega a mano', () => {
    expect(pantalla.sinComentar).toMatch(/void revisar\(\);/);
    expect(pantalla.codigo).not.toMatch(/borrarToken|SecureStore/);
    expect(pantalla.codigo).not.toMatch(/router\.(replace|push)\(['"`]\/entrar/);
  });
});
