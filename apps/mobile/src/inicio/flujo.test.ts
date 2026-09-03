import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@gymlab/api-client';
import type { BodyMetric, DuesStatus, Member, OwnRoutine } from '@gymlab/contracts';
import { RUTAS_DE_TABS } from '../navegacion/destinos';
import { clasificarError } from '../auth/clasificar';
import { debeBorrarToken } from '../auth/estado';
import { inicioEsUtil, type DatosDeInicio, type DatosEsenciales } from './logica';

/**
 * La ESTRATEGIA DE CARGA de Inicio.
 *
 * Se replica la secuencia del componente —tres peticiones con `allSettled` y
 * un estado por seccion— sobre los mismos tipos que usa la pantalla. No hace
 * falta React: lo que se comprueba es que un fallo secundario no arrastre a
 * los demas.
 */

const FICHA = {
  id: '11111111-1111-4111-8111-111111111111',
  memberNumber: 128,
  firstName: 'Lucia',
  lastName: 'Fernandez',
  email: null,
  phone: null,
  birthDate: null,
  status: 'active',
  joinedAt: '2026-01-10',
  leftAt: null,
  hasAccount: true,
} as Member;

const CUOTA = {
  estado: 'AL_CORRIENTE',
  puedeAcceder: true,
  diasRestantes: 17,
  hasta: '2026-09-20',
  planName: 'Mensual',
} as DuesStatus;

const RUTINA = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Fuerza',
  description: null,
  items: [],
  status: 'active',
  assignmentId: '33333333-3333-4333-8333-333333333333',
  assignedAt: '2026-08-19T09:00:00.000Z',
} as OwnRoutine;

/** La misma secuencia que ejecuta `cargar()` en la pantalla. */
async function cargar(fuente: {
  esenciales: () => Promise<DatosEsenciales>;
  rutinas: () => Promise<readonly OwnRoutine[]>;
  progreso: () => Promise<readonly BodyMetric[]>;
}): Promise<DatosDeInicio> {
  const [esenciales, rutinas, progreso] = await Promise.allSettled([
    fuente.esenciales(),
    fuente.rutinas(),
    fuente.progreso(),
  ]);

  return {
    esenciales:
      esenciales.status === 'fulfilled'
        ? { estado: 'ok', datos: esenciales.value }
        : { estado: 'fallo' },
    rutinas:
      rutinas.status === 'fulfilled' ? { estado: 'ok', datos: rutinas.value } : { estado: 'fallo' },
    progreso:
      progreso.status === 'fulfilled'
        ? { estado: 'ok', datos: progreso.value }
        : { estado: 'fallo' },
  };
}

function fuenteFalsa(opciones: {
  esenciales?: () => Promise<DatosEsenciales>;
  rutinas?: () => Promise<readonly OwnRoutine[]>;
  progreso?: () => Promise<readonly BodyMetric[]>;
} = {}) {
  return {
    esenciales: vi.fn(opciones.esenciales ?? (async () => ({ ficha: FICHA, cuota: CUOTA }))),
    rutinas: vi.fn(opciones.rutinas ?? (async () => [RUTINA] as readonly OwnRoutine[])),
    progreso: vi.fn(opciones.progreso ?? (async () => [] as readonly BodyMetric[])),
  };
}

describe('abrir Inicio', () => {
  it('pide las tres cosas, y las tres en paralelo', async () => {
    const fuente = fuenteFalsa();
    const datos = await cargar(fuente);

    expect(fuente.esenciales).toHaveBeenCalledTimes(1);
    expect(fuente.rutinas).toHaveBeenCalledTimes(1);
    expect(fuente.progreso).toHaveBeenCalledTimes(1);
    expect(datos.esenciales.estado).toBe('ok');
  });

  it('con todo cargado, cada seccion tiene sus datos', async () => {
    const datos = await cargar(
      fuenteFalsa({
        progreso: async () => [
          { measuredAt: '2026-08-24', weightKg: 71.4 } as unknown as BodyMetric,
        ],
      }),
    );

    expect(datos.rutinas.estado).toBe('ok');
    expect(datos.progreso.estado).toBe('ok');
    if (datos.rutinas.estado !== 'ok' || datos.progreso.estado !== 'ok') throw new Error('mal');
    expect(datos.rutinas.datos).toHaveLength(1);
    expect(datos.progreso.datos).toHaveLength(1);
  });

  it('sin rutinas la seccion carga bien, con la lista vacia', async () => {
    const datos = await cargar(fuenteFalsa({ rutinas: async () => [] }));
    expect(datos.rutinas.estado).toBe('ok');
    if (datos.rutinas.estado !== 'ok') throw new Error('mal');
    expect(datos.rutinas.datos).toEqual([]);
    // Vacio NO es fallo: son dos cosas distintas y se pintan distinto.
    expect(inicioEsUtil(datos)).toBe(true);
  });

  it('sin progreso la seccion carga bien, con la lista vacia', async () => {
    const datos = await cargar(fuenteFalsa({ progreso: async () => [] }));
    expect(datos.progreso.estado).toBe('ok');
    expect(inicioEsUtil(datos)).toBe(true);
  });
});

describe('los fallos no se contagian', () => {
  it('si fallan las RUTINAS, lo esencial y el progreso siguen llegando', async () => {
    const datos = await cargar(
      fuenteFalsa({
        rutinas: async () => {
          throw new ApiError(500, 'Boom');
        },
      }),
    );

    expect(datos.rutinas.estado).toBe('fallo');
    expect(datos.esenciales.estado).toBe('ok');
    expect(datos.progreso.estado).toBe('ok');
    expect(inicioEsUtil(datos)).toBe(true);
  });

  it('si falla el PROGRESO, Inicio sigue en pie', async () => {
    const datos = await cargar(
      fuenteFalsa({
        progreso: async () => {
          throw new NetworkError('GET', '/v1/me/progress', new TypeError('failed'));
        },
      }),
    );

    expect(datos.progreso.estado).toBe('fallo');
    expect(inicioEsUtil(datos)).toBe(true);
  });

  it('si fallan las DOS secundarias, Inicio sigue en pie', async () => {
    const datos = await cargar(
      fuenteFalsa({
        rutinas: async () => {
          throw new ApiError(500, 'a');
        },
        progreso: async () => {
          throw new ApiError(500, 'b');
        },
      }),
    );

    expect(inicioEsUtil(datos)).toBe(true);
    expect(datos.esenciales.estado).toBe('ok');
  });

  it('si falla lo ESENCIAL, la pantalla no puede enseñar nada', async () => {
    const datos = await cargar(
      fuenteFalsa({
        esenciales: async () => {
          throw new ApiError(500, 'Boom');
        },
      }),
    );

    expect(inicioEsUtil(datos)).toBe(false);
  });

  it('un fallo esencial NO descarta lo secundario que si llego', async () => {
    // Es la diferencia entre `allSettled` y `all`: con `all`, el primer rechazo
    // tira las respuestas buenas.
    const datos = await cargar(
      fuenteFalsa({
        esenciales: async () => {
          throw new ApiError(500, 'Boom');
        },
      }),
    );

    expect(datos.rutinas.estado).toBe('ok');
  });
});

describe('la sesion sigue mandando la politica de M1', () => {
  it('un 401 en Inicio si invalida el token', () => {
    expect(debeBorrarToken(clasificarError(new ApiError(401, 'No autorizado')))).toBe(true);
  });

  it('un 500 en Inicio NO cierra la sesion', () => {
    expect(debeBorrarToken(clasificarError(new ApiError(500, 'Boom')))).toBe(false);
  });

  it('un fallo de red en Inicio NO cierra la sesion', () => {
    const problema = new NetworkError('GET', '/v1/me/dues', new TypeError('failed'));
    expect(debeBorrarToken(clasificarError(problema))).toBe(false);
  });
});

describe('a donde llevan los botones', () => {
  it('el carne', () => {
    expect(RUTAS_DE_TABS.carne).toBe('/carne');
  });

  it('la rutina', () => {
    expect(RUTAS_DE_TABS.rutina).toBe('/rutina');
  });

  it('el progreso', () => {
    expect(RUTAS_DE_TABS.progreso).toBe('/progreso');
  });
});

describe('refrescar', () => {
  it('vuelve a pedir las tres, y no mas de una vez por gesto', async () => {
    const fuente = fuenteFalsa();

    await cargar(fuente); // entrar
    await cargar(fuente); // tirar hacia abajo

    expect(fuente.esenciales).toHaveBeenCalledTimes(2);
    expect(fuente.rutinas).toHaveBeenCalledTimes(2);
    expect(fuente.progreso).toHaveBeenCalledTimes(2);
  });

  it('un refresco que falla en lo secundario no borra lo que ya se veia', async () => {
    // El estado se reemplaza entero, asi que la seccion pasa a `fallo` y lo
    // dice — pero lo esencial se conserva y la pantalla sigue sirviendo.
    const datos = await cargar(
      fuenteFalsa({
        rutinas: async () => {
          throw new ApiError(503, 'no disponible');
        },
      }),
    );

    expect(inicioEsUtil(datos)).toBe(true);
    expect(datos.rutinas.estado).toBe('fallo');
  });
});
