import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@gymlab/api-client';
import type { OwnRoutine } from '@gymlab/contracts';
import { clasificarError } from '../auth/clasificar';
import { debeBorrarToken } from '../auth/estado';
import { laSesionYaNoVale } from '../auth/politica';
import { vistaDeRutina, type EstadoDeCarga } from './logica';

/**
 * La ESTRATEGIA DE CARGA de Rutina.
 *
 * Se replica la secuencia del componente —una peticion, un estado, y la vista
 * DERIVADA de los datos frescos— sobre los mismos tipos que usa la pantalla.
 * No hace falta React: lo que se comprueba son las decisiones.
 */

function rutina(id: string, nombre: string): OwnRoutine {
  return {
    id,
    name: nombre,
    description: null,
    items: [],
    status: 'active',
    assignmentId: `asignacion-${id}`,
    assignedAt: '2026-08-19T22:29:17.703Z',
  } as OwnRoutine;
}

const FUERZA = rutina('fuerza', 'Fuerza principiantes');
const MOVILIDAD = rutina('movilidad', 'Movilidad de hombro');

/** La misma secuencia que ejecuta `cargar()` en la pantalla. */
async function cargar(
  fuente: () => Promise<readonly OwnRoutine[]>,
  alPerderLaSesion: () => void,
): Promise<EstadoDeCarga | 'sesion-invalida'> {
  try {
    return { fase: 'ok', rutinas: await fuente() };
  } catch (problema) {
    if (laSesionYaNoVale([problema])) {
      alPerderLaSesion();
      return 'sesion-invalida';
    }
    return { fase: 'fallo', mensaje: 'No pudimos cargar tus rutinas.' };
  }
}

describe('cargar', () => {
  it('con una rutina, queda lista para mirarse', async () => {
    const estado = await cargar(async () => [FUERZA], vi.fn());
    expect(estado).toEqual({ fase: 'ok', rutinas: [FUERZA] });
  });

  it('con varias, las trae todas sin elegir ninguna', async () => {
    const estado = await cargar(async () => [MOVILIDAD, FUERZA], vi.fn());
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(vistaDeRutina(estado.rutinas, null).tipo).toBe('eligiendo');
  });

  it('sin rutinas, estado vacio y no un error', async () => {
    const estado = await cargar(async () => [], vi.fn());
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(vistaDeRutina(estado.rutinas, null).tipo).toBe('sinRutinas');
  });
});

describe('cuando falla', () => {
  it('un 500 deja un error recuperable, con su mensaje y sin codigos', async () => {
    const estado = await cargar(async () => {
      throw new ApiError(500, 'Boom');
    }, vi.fn());
    expect(estado).toEqual({ fase: 'fallo', mensaje: 'No pudimos cargar tus rutinas.' });
    if (typeof estado === 'string' || estado.fase !== 'fallo') return;
    expect(estado.mensaje).not.toMatch(/500|Boom|Error/);
  });

  it('un fallo de red tambien es recuperable', async () => {
    const estado = await cargar(async () => {
      throw new NetworkError('GET', '/v1/me/routines', new TypeError('failed'));
    }, vi.fn());
    if (typeof estado === 'string' || estado.fase !== 'fallo') throw new Error('deberia fallar');
    expect(estado.fase).toBe('fallo');
  });

  it('reintentar despues de un fallo trae los datos', async () => {
    let intentos = 0;
    const fuente = async () => {
      intentos += 1;
      if (intentos === 1) throw new ApiError(500, 'Boom');
      return [FUERZA];
    };

    expect(await cargar(fuente, vi.fn())).toMatchObject({ fase: 'fallo' });
    expect(await cargar(fuente, vi.fn())).toEqual({ fase: 'ok', rutinas: [FUERZA] });
  });
});

describe('la sesion sigue mandando la politica de M1', () => {
  it('un 401 en Rutina devuelve la decision a la sesion, y no la toma la pantalla', async () => {
    const revisar = vi.fn();
    const estado = await cargar(async () => {
      throw new ApiError(401, 'No autorizado');
    }, revisar);

    expect(revisar).toHaveBeenCalledOnce();
    // La pantalla NO se queda con un error suyo: manda la sesion.
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

  it('un fallo de red NO cierra la sesion', async () => {
    const problema = new NetworkError('GET', '/v1/me/routines', new TypeError('failed'));
    expect(debeBorrarToken(clasificarError(problema))).toBe(false);
  });

  it('solo el 401 invalida el token', () => {
    expect(debeBorrarToken(clasificarError(new ApiError(401, 'No autorizado')))).toBe(true);
  });
});

describe('refrescar', () => {
  it('vuelve a pedir y se queda con lo ultimo', async () => {
    const fuente = vi
      .fn<() => Promise<readonly OwnRoutine[]>>()
      .mockResolvedValueOnce([MOVILIDAD, FUERZA])
      .mockResolvedValueOnce([MOVILIDAD]);

    await cargar(fuente, vi.fn());
    const segunda = await cargar(fuente, vi.fn());

    expect(fuente).toHaveBeenCalledTimes(2);
    if (typeof segunda === 'string' || segunda.fase !== 'ok') throw new Error('deberia cargar');
    expect(segunda.rutinas).toEqual([MOVILIDAD]);
  });

  it('mantiene lo que se estaba mirando si sigue estando', async () => {
    const estado = await cargar(async () => [MOVILIDAD, FUERZA], vi.fn());
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');

    const vista = vistaDeRutina(estado.rutinas, 'fuerza');
    if (vista.tipo !== 'mirando') throw new Error('deberia mantener la seleccion');
    expect(vista.mirada.id).toBe('fuerza');
  });

  it('si lo que se miraba desaparecio, vuelve a la eleccion sin dar por buena la primera', async () => {
    const estado = await cargar(async () => [MOVILIDAD, rutina('tercera', 'Otra')], vi.fn());
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(vistaDeRutina(estado.rutinas, 'fuerza').tipo).toBe('eligiendo');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE ESTA PANTALLA NO PUEDE HACER, COMPROBADO EN EL CODIGO FUENTE.    │
 * │                                                                          │
 * │ Estas dos pruebas leen los ficheros. Es deliberado: lo que se protege no │
 * │ es el resultado de una funcion, es que NO EXISTA cierto codigo.          │
 * │                                                                          │
 * │  1. La rutina que se mira es estado de interfaz. Si alguien la guarda en │
 * │     SecureStore o en AsyncStorage, deja de ser "lo que estoy mirando" y  │
 * │     pasa a ser una preferencia persistida que el backend no reconoce.    │
 * │                                                                          │
 * │  2. No hay ejercicio completado en ninguna parte del producto —ni tabla, │
 * │     ni columna, ni endpoint—, asi que no puede haber casilla, contador   │
 * │     ni barra de progreso que finja guardarlo.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RAIZ = join(__dirname, '..', '..');

/**
 * El codigo sin sus comentarios.
 *
 * Los comentarios de estos ficheros EXPLICAN lo que no existe —"ejercicio
 * completado", "rutina principal"— y esa explicacion es justo lo que se quiere
 * conservar. Lo que se prohibe es el codigo que lo implemente.
 */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const FUENTES = [
  'app/(tabs)/rutina.tsx',
  'src/rutina/logica.ts',
  'src/rutina/fuente.ts',
  'src/rutina/fuente-real.ts',
  'src/componentes/ejercicio-de-rutina.tsx',
  'src/componentes/selector-de-rutina.tsx',
].map((relativo) => {
  const bruto = readFileSync(join(RAIZ, relativo), 'utf8');
  return { relativo, codigo: bruto, sinComentar: sinComentarios(bruto) };
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA SOLA FORMA DE PREGUNTAR "¿ESTE FALLO JUSTIFICA REVISAR LA SESION?". │
 * │                                                                          │
 * │ Rutina tenia su propia comprobacion escrita a mano e Inicio usaba        │
 * │ `laSesionYaNoVale`. La misma decision escrita dos veces es como empiezan │
 * │ a separarse: basta con que alguien afine una y se olvide de la otra.     │
 * │                                                                          │
 * │ Esto se lee del fichero de la pantalla porque lo que se protege es que   │
 * │ NO vuelva a aparecer la version a mano — una prueba de comportamiento no │
 * │ notaria la diferencia, porque las dos hacen lo mismo hoy.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('Rutina usa la misma politica de sesion que Inicio', () => {
  const pantalla = FUENTES.find((f) => f.relativo === 'app/(tabs)/rutina.tsx')!;

  it('pregunta con `laSesionYaNoVale`', () => {
    expect(pantalla.sinComentar).toMatch(/laSesionYaNoVale\(\[problema\]\)/);
  });

  it('y no vuelve a escribir la comprobacion a mano', () => {
    expect(pantalla.sinComentar).not.toMatch(/clasificarError/);
    expect(pantalla.sinComentar).not.toMatch(/'sesionInvalida'/);
  });

  it('al detectarlo delega en `revisar`, sin borrar token ni navegar a mano', () => {
    expect(pantalla.sinComentar).toMatch(/void revisar\(\);/);
    expect(pantalla.codigo).not.toMatch(/borrarToken/);
    expect(pantalla.codigo).not.toMatch(/router\.(replace|push)\(['"`]\/entrar/);
  });
});

describe('la rutina mirada NO se persiste como decision de negocio', () => {
  it('ningun fichero de Rutina toca un almacen persistente', () => {
    for (const { relativo, codigo } of FUENTES) {
      expect(codigo, relativo).not.toMatch(/SecureStore|AsyncStorage|localStorage/);
      expect(codigo, relativo).not.toMatch(/guardarToken|guardarSeleccion|persistir/);
    }
  });

  it('no se manda al servidor: la pantalla solo LEE', () => {
    for (const { relativo, codigo } of FUENTES) {
      expect(codigo, relativo).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/);
    }
  });
});

describe('no hay estado de entrenamiento que no exista en el producto', () => {
  it('sin casillas, sin contadores de series hechas y sin barra de progreso', () => {
    for (const { relativo, sinComentar } of FUENTES) {
      expect(sinComentar, relativo).not.toMatch(/checkbox|Checkbox/i);
      expect(sinComentar, relativo).not.toMatch(/completad[oa]s?\b/i);
      expect(sinComentar, relativo).not.toMatch(/\bSwitch\b|ProgressBar|ProgressView/);
    }
  });

  it('ninguna rutina se llama principal, actual, de hoy ni recomendada', () => {
    for (const { relativo, sinComentar } of FUENTES) {
      // En comentarios se puede EXPLICAR que no existe; lo que no puede haber
      // es una cadena de interfaz que se lo diga al socio.
      const cadenas = sinComentar.match(/>[^<>{}]*[a-zA-Z][^<>{}]*</g) ?? [];
      for (const cadena of cadenas) {
        expect(cadena.toLowerCase(), `${relativo}: ${cadena}`).not.toMatch(
          /rutina (principal|actual|de hoy|recomendada)/,
        );
      }
    }
  });
});
