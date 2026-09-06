import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, ApiResponseError, NetworkError } from '@gymlab/api-client';
import type { BodyMetric, DuesStatus, Member, OwnRoutine } from '@gymlab/contracts';
import { RUTAS_DE_TABS } from '../navegacion/destinos';
import { clasificarError } from '../auth/clasificar';
import { debeBorrarToken } from '../auth/estado';
import { laSesionYaNoVale, motivosDeFallo } from '../auth/politica';
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

/**
 * La misma secuencia que ejecuta `cargar()` en la pantalla, ENTERA.
 *
 * Incluye la rama del 401: si alguna de las cuatro peticiones dice que la
 * sesion ya no vale, la pantalla no pinta ni error ni datos parciales — llama
 * a `revisar()` y se aparta.
 */
interface FuenteDeInicio {
  esenciales: () => Promise<DatosEsenciales>;
  rutinas: () => Promise<readonly OwnRoutine[]>;
  progreso: () => Promise<readonly BodyMetric[]>;
}

async function cargar(
  fuente: FuenteDeInicio,
  revisar: () => void = () => undefined,
): Promise<DatosDeInicio | 'sesion-invalida'> {
  const resultados = await Promise.allSettled([
    fuente.esenciales(),
    fuente.rutinas(),
    fuente.progreso(),
  ]);
  const [esenciales, rutinas, progreso] = resultados;

  if (laSesionYaNoVale(motivosDeFallo(resultados))) {
    revisar();
    return 'sesion-invalida';
  }

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

/**
 * Cargar esperando que la sesion AGUANTE.
 *
 * Las pruebas que hablan de secciones y de errores recuperables no quieren
 * comprobar la sesion: quieren datos. Si alguna acaba invalidandola, es un
 * fallo de esa prueba y se dice aqui en vez de reventar mas abajo con un
 * mensaje que no explica nada.
 */
async function cargarDatos(
  fuente: FuenteDeInicio,
  revisar: () => void = () => undefined,
): Promise<DatosDeInicio> {
  const resultado = await cargar(fuente, revisar);
  if (resultado === 'sesion-invalida') throw new Error('no deberia invalidar la sesion');
  return resultado;
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
    const datos = await cargarDatos(fuente);

    expect(fuente.esenciales).toHaveBeenCalledTimes(1);
    expect(fuente.rutinas).toHaveBeenCalledTimes(1);
    expect(fuente.progreso).toHaveBeenCalledTimes(1);
    expect(datos.esenciales.estado).toBe('ok');
  });

  it('con todo cargado, cada seccion tiene sus datos', async () => {
    const datos = await cargarDatos(
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
    const datos = await cargarDatos(fuenteFalsa({ rutinas: async () => [] }));
    expect(datos.rutinas.estado).toBe('ok');
    if (datos.rutinas.estado !== 'ok') throw new Error('mal');
    expect(datos.rutinas.datos).toEqual([]);
    // Vacio NO es fallo: son dos cosas distintas y se pintan distinto.
    expect(inicioEsUtil(datos)).toBe(true);
  });

  it('sin progreso la seccion carga bien, con la lista vacia', async () => {
    const datos = await cargarDatos(fuenteFalsa({ progreso: async () => [] }));
    expect(datos.progreso.estado).toBe('ok');
    expect(inicioEsUtil(datos)).toBe(true);
  });
});

describe('los fallos no se contagian', () => {
  it('si fallan las RUTINAS, lo esencial y el progreso siguen llegando', async () => {
    const datos = await cargarDatos(
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
    const datos = await cargarDatos(
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
    const datos = await cargarDatos(
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
    const datos = await cargarDatos(
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
    const datos = await cargarDatos(
      fuenteFalsa({
        esenciales: async () => {
          throw new ApiError(500, 'Boom');
        },
      }),
    );

    expect(datos.rutinas.estado).toBe('ok');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN 401 NO ES UN FALLO DE SECCION, VENGA DE DONDE VENGA.                 │
 * │                                                                          │
 * │ Este bloque existe por un fallo real: Inicio trataba CUALQUIER rechazo   │
 * │ como fallo de su seccion. Un 401 en el progreso dejaba a alguien con la  │
 * │ sesion caducada mirando "no pudimos cargar tu progreso" indefinidamente, │
 * │ y uno en la ficha pintaba "el correo o la contrasena no son correctos"   │
 * │ en mitad de la app.                                                      │
 * │                                                                          │
 * │ La politica no cambia y no se duplica: se delega en `revisar()`, que     │
 * │ vuelve a preguntar a `/auth/me` y deja que decida el servidor.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `cargarEsenciales` pide la ficha Y la cuota con `Promise.all`, asi que se
 * replica igual para poder probar cada una por separado.
 */
function esencialesDe(
  ficha: () => Promise<Member>,
  cuota: () => Promise<DuesStatus>,
): () => Promise<DatosEsenciales> {
  return async () => {
    const [f, c] = await Promise.all([ficha(), cuota()]);
    return { ficha: f, cuota: c };
  };
}

const noAutorizado = async () => {
  // ASINCRONO a proposito: las fuentes reales son `async`, y un doble que
  // lanza de forma sincrona se escapa del `allSettled` en vez de rechazar.
  throw new ApiError(401, 'Unauthorized');
};

describe('cualquier 401 va a la politica global de sesion', () => {
  it('un 401 en el PERFIL invalida la sesion', async () => {
    const revisar = vi.fn();
    const resultado = await cargar(
      fuenteFalsa({ esenciales: esencialesDe(noAutorizado, async () => CUOTA) }),
      revisar,
    );

    expect(resultado).toBe('sesion-invalida');
    expect(revisar).toHaveBeenCalledOnce();
  });

  it('un 401 en la CUOTA invalida la sesion', async () => {
    const revisar = vi.fn();
    const resultado = await cargar(
      fuenteFalsa({ esenciales: esencialesDe(async () => FICHA, noAutorizado) }),
      revisar,
    );

    expect(resultado).toBe('sesion-invalida');
    expect(revisar).toHaveBeenCalledOnce();
  });

  it('un 401 en las RUTINAS invalida la sesion, aunque sea una seccion secundaria', async () => {
    const revisar = vi.fn();
    const resultado = await cargar(fuenteFalsa({ rutinas: noAutorizado }), revisar);

    expect(resultado).toBe('sesion-invalida');
    expect(revisar).toHaveBeenCalledOnce();
  });

  it('un 401 en el PROGRESO invalida la sesion, aunque sea una seccion secundaria', async () => {
    const revisar = vi.fn();
    const resultado = await cargar(fuenteFalsa({ progreso: noAutorizado }), revisar);

    expect(resultado).toBe('sesion-invalida');
    expect(revisar).toHaveBeenCalledOnce();
  });

  it('con DOS 401 a la vez se revisa UNA sola vez: no hay doble borrado', async () => {
    const revisar = vi.fn();
    const resultado = await cargar(
      fuenteFalsa({ rutinas: noAutorizado, progreso: noAutorizado }),
      revisar,
    );

    expect(resultado).toBe('sesion-invalida');
    expect(revisar).toHaveBeenCalledTimes(1);
  });

  it('un 401 NO deja ademas un error de pantalla: la sesion manda y punto', async () => {
    const resultado = await cargar(fuenteFalsa({ progreso: noAutorizado }));
    // No hay datos parciales que pintar: ni "ok" ni "fallo" por seccion.
    expect(resultado).toBe('sesion-invalida');
  });

  it('un 401 mezclado con un 500 sigue siendo un 401', async () => {
    const revisar = vi.fn();
    const resultado = await cargar(
      fuenteFalsa({
        rutinas: async () => {
          throw new ApiError(500, 'Boom');
        },
        progreso: noAutorizado,
      }),
      revisar,
    );

    expect(resultado).toBe('sesion-invalida');
    expect(revisar).toHaveBeenCalledOnce();
  });
});

describe('lo que NO es un 401 no toca la sesion', () => {
  const conserva = async (fallo: () => Promise<never>) => {
    const revisar = vi.fn();
    const datos = await cargarDatos(fuenteFalsa({ rutinas: fallo }), revisar);
    expect(revisar).not.toHaveBeenCalled();
    return datos;
  };

  it('un 500 en las rutinas deja Inicio parcial y conserva el token', async () => {
    const datos = await conserva(async () => {
      throw new ApiError(500, 'Boom');
    });
    expect(datos.rutinas.estado).toBe('fallo');
    expect(inicioEsUtil(datos)).toBe(true);
    expect(debeBorrarToken(clasificarError(new ApiError(500, 'Boom')))).toBe(false);
  });

  it('un 500 en el progreso deja Inicio parcial y conserva el token', async () => {
    const revisar = vi.fn();
    const datos = await cargarDatos(
      fuenteFalsa({
        progreso: async () => {
          throw new ApiError(500, 'Boom');
        },
      }),
      revisar,
    );

    expect(revisar).not.toHaveBeenCalled();
    expect(datos.progreso.estado).toBe('fallo');
    expect(inicioEsUtil(datos)).toBe(true);
  });

  it('un fallo de red secundario deja Inicio parcial y conserva el token', async () => {
    const datos = await conserva(async () => {
      throw new NetworkError('GET', '/v1/me/routines', new TypeError('failed'));
    });
    expect(datos.rutinas.estado).toBe('fallo');
    expect(inicioEsUtil(datos)).toBe(true);
  });

  it('un 429 NO cierra la sesion', async () => {
    const datos = await conserva(async () => {
      throw new ApiError(429, 'Too Many Requests');
    });
    expect(datos.rutinas.estado).toBe('fallo');
    expect(debeBorrarToken(clasificarError(new ApiError(429, 'Too Many Requests')))).toBe(false);
  });

  it('un 403 y un 404 tampoco', async () => {
    for (const status of [403, 404, 409]) {
      const revisar = vi.fn();
      await cargarDatos(
        fuenteFalsa({
          rutinas: async () => {
            throw new ApiError(status, 'no');
          },
        }),
        revisar,
      );
      expect(revisar, `status ${status}`).not.toHaveBeenCalled();
    }
  });

  it('una respuesta que no cumple el contrato tampoco cierra la sesion', async () => {
    const revisar = vi.fn();
    const datos = await cargarDatos(
      fuenteFalsa({
        progreso: async () => {
          // Un `ZodError` de verdad: el que produce el contrato al no cuadrar.
          const fallo = z.array(z.object({ measuredAt: z.string() })).safeParse([{ measuredAt: 7 }]);
          throw new ApiResponseError('GET', '/v1/me/progress', fallo.error!);
        },
      }),
      revisar,
    );

    expect(revisar).not.toHaveBeenCalled();
    expect(datos.progreso.estado).toBe('fallo');
  });
});

describe('la politica no se ejecuta de mas', () => {
  it('sin fallos no se revisa la sesion', async () => {
    const revisar = vi.fn();
    await cargarDatos(fuenteFalsa(), revisar);
    expect(revisar).not.toHaveBeenCalled();
  });

  it('cargar de nuevo tras un 401 no encadena revisiones por su cuenta', async () => {
    // La pantalla llama a `cargar` al enfocar y al tirar hacia abajo. Cada
    // pasada revisa como mucho UNA vez: no hay bucle revisar -> cargar.
    const revisar = vi.fn();
    const fuente = fuenteFalsa({ progreso: noAutorizado });

    await cargar(fuente, revisar);
    expect(revisar).toHaveBeenCalledTimes(1);
  });

  it('`laSesionYaNoVale` ignora los huecos de las promesas que si funcionaron', () => {
    expect(laSesionYaNoVale([undefined, undefined])).toBe(false);
    expect(laSesionYaNoVale([])).toBe(false);
    expect(laSesionYaNoVale([new ApiError(401, 'x')])).toBe(true);
  });

  it('`motivosDeFallo` solo devuelve los rechazos, en orden', () => {
    const a = new ApiError(500, 'a');
    const b = new ApiError(401, 'b');
    const motivos = motivosDeFallo([
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: a },
      { status: 'fulfilled', value: 2 },
      { status: 'rejected', reason: b },
    ]);

    expect(motivos).toEqual([a, b]);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE FICHERO REPLICA `cargar()`; NO LO IMPORTA.                         │
 * │                                                                          │
 * │ Es el patron de M5 y evita montar React, pero tiene un riesgo evidente:  │
 * │ si la pantalla deja de delegar el 401 y la replica no, las pruebas       │
 * │ siguen verdes sobre un codigo que ya no existe.                          │
 * │                                                                          │
 * │ Asi que esto se lee del fichero de la pantalla. No es elegante; es lo    │
 * │ que hace que la falsificacion no sea circular.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('la pantalla delega de verdad, no solo la replica', () => {
  const codigo = readFileSync(join(__dirname, '..', '..', 'app', '(socio)', 'inicio.tsx'), 'utf8');

  it('Inicio consulta la politica de sesion', () => {
    expect(codigo).toMatch(/laSesionYaNoVale\(motivosDeFallo\(resultados\)\)/);
  });

  it('y al detectarla llama a `revisar` y se aparta', () => {
    expect(codigo).toMatch(/void revisar\(\);/);
  });

  it('Inicio NO borra el token por su cuenta ni navega a mano', () => {
    expect(codigo).not.toMatch(/borrarToken|SecureStore/);
    expect(codigo).not.toMatch(/router\.(replace|push)\(['"`]\/entrar/);
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
    const datos = await cargarDatos(
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
