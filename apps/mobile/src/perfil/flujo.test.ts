import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@gymlab/api-client';
import type { OwnPayment } from '@gymlab/contracts';
import { clasificarError } from '../auth/clasificar';
import { debeBorrarToken } from '../auth/estado';
import { laSesionYaNoVale } from '../auth/politica';
import { fechaCivil, fechaDeInstante, horaDeInstante } from '../formato/fecha';
import {
  DESTINOS_DE_TABS,
  destinoAlVolver,
  destinoDe,
  puedeEntrarEnTabs,
} from '../navegacion/destinos';
import type { EstadoDeSesion } from '../auth/estado';
import { acumular, type Acumulado, type EstadoDeCarga } from './logica';

const RAIZ = join(__dirname, '..', '..');

/** El codigo sin sus comentarios: ahi se explica lo que NO existe. */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}


function pago(id: string): OwnPayment {
  return {
    id,
    concept: 'subscription',
    amountCents: 3500,
    currency: 'EUR',
    method: 'cash',
    paidOn: '2026-08-20',
    voidedAt: null,
    voidReason: null,
  } as OwnPayment;
}

/** La misma secuencia que ejecuta `pedir()` en Pagos y en Accesos. */
async function pedir<T>(
  fuente: (pagina: number) => Promise<{ items: readonly T[]; total: number; page: number }>,
  pagina: number,
  previo: Acumulado<T> | null,
  alPerderLaSesion: () => void = () => undefined,
): Promise<EstadoDeCarga<Acumulado<T>> | 'sesion-invalida' | 'se-queda-lo-que-hay'> {
  try {
    return { fase: 'ok', datos: acumular(previo, await fuente(pagina)) };
  } catch (problema) {
    if (laSesionYaNoVale([problema])) {
      alPerderLaSesion();
      return 'sesion-invalida';
    }
    if (previo) return 'se-queda-lo-que-hay';
    return { fase: 'fallo', mensaje: 'No pudimos cargar tus pagos.' };
  }
}

describe('cargar una lista paginada', () => {
  it('con datos', async () => {
    const estado = await pedir(async () => ({ items: [pago('a')], total: 1, page: 1 }), 1, null);
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(estado.datos.elementos).toHaveLength(1);
  });

  it('vacia NO es un error', async () => {
    const estado = await pedir(async () => ({ items: [], total: 0, page: 1 }), 1, null);
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(estado.datos.elementos).toEqual([]);
    expect(estado.datos.total).toBe(0);
  });

  it('un 500 en la PRIMERA pagina deja error recuperable', async () => {
    const estado = await pedir(async () => {
      throw new ApiError(500, 'Boom');
    }, 1, null);
    expect(estado).toMatchObject({ fase: 'fallo' });
  });

  it('reintentar tras el fallo trae los datos', async () => {
    let intentos = 0;
    const fuente = async () => {
      intentos += 1;
      if (intentos === 1) throw new ApiError(500, 'Boom');
      return { items: [pago('a')], total: 1, page: 1 };
    };
    expect(await pedir(fuente, 1, null)).toMatchObject({ fase: 'fallo' });
    expect(await pedir(fuente, 1, null)).toMatchObject({ fase: 'ok' });
  });

  /*
   * Un fallo al traer la SEGUNDA pagina no puede borrar la primera: quien
   * estaba leyendo sus pagos se quedaria con una pantalla de error en lugar de
   * lo que ya tenia delante.
   */
  it('un fallo al traer MAS no borra lo que ya se estaba leyendo', async () => {
    const previo = acumular(null, { items: [pago('a')], total: 60, page: 1 });
    const estado = await pedir(async () => {
      throw new ApiError(500, 'Boom');
    }, 2, previo);
    expect(estado).toBe('se-queda-lo-que-hay');
  });

  it('refrescar vuelve a empezar por la primera pagina', async () => {
    const previo = acumular(null, { items: [pago('a'), pago('b')], total: 2, page: 1 });
    const estado = await pedir(async () => ({ items: [pago('c')], total: 1, page: 1 }), 1, null);
    if (typeof estado === 'string' || estado.fase !== 'ok') throw new Error('deberia cargar');
    expect(estado.datos.elementos).toHaveLength(1);
    expect(previo.elementos).toHaveLength(2);
  });
});

describe('la sesion sigue mandando la politica global', () => {
  it('un 401 la devuelve a la sesion', async () => {
    const revisar = vi.fn();
    const estado = await pedir(async () => {
      throw new ApiError(401, 'No autorizado');
    }, 1, null, revisar);
    expect(revisar).toHaveBeenCalledOnce();
    expect(estado).toBe('sesion-invalida');
  });

  it('un 401 al traer MAS tambien: la sesion manda sobre la pagina', async () => {
    const revisar = vi.fn();
    const previo = acumular(null, { items: [pago('a')], total: 60, page: 1 });
    const estado = await pedir(async () => {
      throw new ApiError(401, 'No autorizado');
    }, 2, previo, revisar);
    expect(revisar).toHaveBeenCalledOnce();
    expect(estado).toBe('sesion-invalida');
  });

  it('500, 429 y red NO cierran la sesion', async () => {
    const revisar = vi.fn();
    for (const problema of [
      new ApiError(500, 'Boom'),
      new ApiError(429, 'Too Many Requests'),
      new NetworkError('GET', '/v1/me/payments', new TypeError('failed')),
    ]) {
      await pedir(async () => {
        throw problema;
      }, 1, null, revisar);
      expect(debeBorrarToken(clasificarError(problema))).toBe(false);
    }
    expect(revisar).not.toHaveBeenCalled();
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS DOS CLASES DE FECHA, OTRA VEZ, Y ESTA VEZ EN LA MISMA FILA.         │
 * │                                                                          │
 * │ `paidOn` es una columna `date` que la API emite CRUDA: fecha civil.      │
 * │ `voidedAt` y `occurredAt` son `timestamptz` con `toISOString()`.         │
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

describe('las fechas de Perfil', () => {
  it('mover TZ cambia de verdad la hora local (si no, lo demas no prueba nada)', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const a = new Date('2026-08-24T02:00:00.000Z').getHours();
      process.env.TZ = 'America/Los_Angeles';
      expect(new Date('2026-08-24T02:00:00.000Z').getHours()).not.toBe(a);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('`paidOn` NO se mueve con el huso: es el dia que se recibio el dinero', () => {
    enCadaHuso((huso) => {
      expect(fechaCivil('2026-08-20'), huso).toBe('20 ago 2026');
    });
  });

  it('`occurredAt` SI se dice en la hora local de quien mira', () => {
    const iso = '2026-08-25T02:00:00.000Z';
    const esperado: Record<string, string> = {
      UTC: '25 ago 2026',
      'Europe/Madrid': '25 ago 2026',
      'America/Los_Angeles': '24 ago 2026',
    };
    enCadaHuso((huso) => {
      expect(fechaDeInstante(iso), huso).toBe(esperado[huso]);
    });
  });

  it('la hora de un acceso tambien es local, y con dos digitos', () => {
    const iso = '2026-08-25T02:05:00.000Z';
    const esperado: Record<string, string> = {
      UTC: '02:05',
      'Europe/Madrid': '04:05',
      'America/Los_Angeles': '19:05',
    };
    enCadaHuso((huso) => {
      expect(horaDeInstante(iso), huso).toBe(esperado[huso]);
    });
  });

  it('una fecha ilegible no revienta la pantalla', () => {
    expect(fechaCivil('vaya')).toBe('vaya');
    expect(fechaDeInstante('vaya')).toBe('vaya');
    expect(horaDeInstante('vaya')).toBe('');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS TRES SECCIONES NO SON PESTAÑAS, Y NO PUEDEN SERLO.                  │
 * │                                                                          │
 * │ La barra tiene cinco sitios decididos desde M3. Pagos, Accesos y         │
 * │ Privacidad viven FUERA del grupo `(tabs)`, asi que se apilan encima en   │
 * │ vez de convertirse en una sexta.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('las rutas de Perfil', () => {
  it('la barra sigue teniendo CINCO destinos', () => {
    expect(DESTINOS_DE_TABS).toHaveLength(5);
    expect(DESTINOS_DE_TABS.map((d) => d.nombre)).toEqual([
      'inicio',
      'rutina',
      'carne',
      'progreso',
      'perfil',
    ]);
  });

  it('ninguna de las tres secciones es un destino de la barra', () => {
    const nombres = DESTINOS_DE_TABS.map((d) => d.nombre);
    for (const seccion of ['pagos', 'accesos', 'privacidad']) {
      expect(nombres, seccion).not.toContain(seccion);
    }
  });

  it('los ficheros estan FUERA del grupo (tabs)', () => {
    for (const seccion of ['pagos', 'accesos', 'privacidad']) {
      expect(existsSync(join(RAIZ, 'app', 'perfil', `${seccion}.tsx`)), seccion).toBe(true);
      expect(existsSync(join(RAIZ, 'app', '(tabs)', `${seccion}.tsx`)), seccion).toBe(false);
    }
  });

  it('`app/perfil/` no tiene index: /perfil sigue siendo la pestaña', () => {
    expect(existsSync(join(RAIZ, 'app', 'perfil', 'index.tsx'))).toBe(false);
    expect(existsSync(join(RAIZ, 'app', '(tabs)', 'perfil.tsx'))).toBe(true);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ENLACE DIRECTO A UNA SUBRUTA NO PUEDE SALTARSE EL GATE.              │
 * │                                                                          │
 * │ Faltaba, y se vio probandolo: sin `app/perfil/_layout.tsx`, abrir        │
 * │ /perfil/pagos montaba la pantalla con CUALQUIER estado de sesion. Las    │
 * │ dieciocho combinaciones —tres rutas por seis estados— entraban.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('el gate de las subrutas de Perfil', () => {
  const noAutenticados: readonly EstadoDeSesion[] = [
    { tipo: 'sinSesion' },
    { tipo: 'cargando' },
    { tipo: 'rolNoAdmitido', yo: {} as never },
    { tipo: 'requiereSeleccionGimnasio', yo: {} as never, opciones: [] },
    { tipo: 'errorAlComprobar', motivo: 'red' },
  ];

  it('solo `autenticado` puede entrar', () => {
    expect(puedeEntrarEnTabs({ tipo: 'autenticado', yo: {} as never, gymId: 'g1' })).toBe(true);
    for (const estado of noAutenticados) {
      expect(puedeEntrarEnTabs(estado), estado.tipo).toBe(false);
    }
  });

  it('cada estado no autenticado tiene su destino, y ninguno es una subruta', () => {
    for (const estado of noAutenticados) {
      const destino = destinoDe(estado);
      expect(String(destino ?? ''), estado.tipo).not.toMatch(/^\/perfil\//);
    }
  });

  it('existe el layout, y es el que aplica el gate', () => {
    const ruta = join(RAIZ, 'app', 'perfil', '_layout.tsx');
    expect(existsSync(ruta)).toBe(true);
    const codigo = readFileSync(ruta, 'utf8');
    expect(codigo).toMatch(/puedeEntrarEnTabs\(estado\)/);
    expect(codigo).toMatch(/<Redirect href="\/" \/>/);
  });

  it('el gate es el MISMO que el de las pestañas, no una copia distinta', () => {
    const deTabs = readFileSync(join(RAIZ, 'app', '(tabs)', '_layout.tsx'), 'utf8');
    const dePerfil = readFileSync(join(RAIZ, 'app', 'perfil', '_layout.tsx'), 'utf8');
    for (const codigo of [deTabs, dePerfil]) {
      expect(codigo).toMatch(/if \(!puedeEntrarEnTabs\(estado\)\) return <Redirect href="\/" \/>;/);
    }
  });

  it('el gate va UNA vez en el layout, no repetido en las tres pantallas', () => {
    for (const seccion of ['pagos', 'accesos', 'privacidad']) {
      const codigo = readFileSync(join(RAIZ, 'app', 'perfil', `${seccion}.tsx`), 'utf8');
      expect(codigo, seccion).not.toMatch(/puedeEntrarEnTabs|<Redirect/);
    }
  });
});

describe('volver desde una subruta', () => {
  it('con historial, se deshace', () => {
    expect(destinoAlVolver(true)).toBe('atras');
  });

  it('sin historial —un enlace directo— se va a Perfil', () => {
    expect(destinoAlVolver(false)).toBe('/perfil');
  });

  it('nunca lleva a otro sitio que no sea Perfil', () => {
    for (const hay of [true, false]) {
      const destino = destinoAlVolver(hay);
      expect(['atras', '/perfil']).toContain(destino);
    }
  });

  it('la cabecera usa la decision pura y `replace` para el caso sin historial', () => {
    const codigo = readFileSync(
      join(RAIZ, 'src', 'componentes', 'cabecera-de-subpantalla.tsx'),
      'utf8',
    );
    expect(codigo).toMatch(/destinoAlVolver\(router\.canGoBack\(\)\)/);
    expect(codigo).toMatch(/router\.replace\('\/perfil'\)/);
    /*
     * `push` apilaria otra pantalla en vez de deshacer. Se mira el codigo SIN
     * comentarios: uno de ellos explica precisamente por que no se usa `push`,
     * y esa explicacion es justo lo que se quiere conservar.
     */
    expect(sinComentarios(codigo)).not.toMatch(/router\.push\('\/perfil'\)/);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE ESTAS PANTALLAS NO PUEDEN HACER, COMPROBADO EN EL CODIGO FUENTE. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const FUENTES = [
  'app/(tabs)/perfil.tsx',
  'app/perfil/pagos.tsx',
  'app/perfil/accesos.tsx',
  'app/perfil/privacidad.tsx',
  'src/perfil/logica.ts',
  'src/componentes/cabecera-de-subpantalla.tsx',
].map((relativo) => {
  const bruto = readFileSync(join(RAIZ, relativo), 'utf8');
  return { relativo, codigo: bruto, sinComentar: sinComentarios(bruto) };
});

describe('el perfil no se edita, porque la API no lo permite', () => {
  it('ninguna pantalla escribe sobre la ficha', () => {
    for (const { relativo, sinComentar } of FUENTES) {
      expect(sinComentar, relativo).not.toMatch(/TextInput|actualizarFicha|editarPerfil/);
    }
  });

  it('no hay foto, ni contraseña, ni tarjeta, ni factura, ni borrar cuenta', () => {
    const inventadas =
      /avatar|foto de perfil|cambiar contraseña|nueva contraseña|tarjeta guardada|descargar factura|borrar mi cuenta|eliminar cuenta|notificaciones push|biometr/i;
    for (const { relativo, sinComentar } of FUENTES) {
      expect(sinComentar, relativo).not.toMatch(inventadas);
    }
  });

  it('en accesos no se nombra una puerta, un torno ni un lector concreto', () => {
    const pantalla = FUENTES.find((f) => f.relativo === 'app/perfil/accesos.tsx')!;
    const cadenas = pantalla.sinComentar.match(/>[^<>{}]*[a-zA-Z][^<>{}]*</g) ?? [];
    for (const cadena of cadenas) {
      expect(cadena, cadena).not.toMatch(/puerta principal|torno|molinete|sede/i);
    }
  });
});

describe('todas usan la politica de sesion compartida', () => {
  const pantallas = FUENTES.filter((f) => f.relativo.startsWith('app/'));

  it('preguntan con `laSesionYaNoVale`, no con una comprobacion a mano', () => {
    for (const { relativo, sinComentar } of pantallas) {
      expect(sinComentar, relativo).toMatch(/laSesionYaNoVale\(\[problema\]\)/);
      expect(sinComentar, relativo).not.toMatch(/clasificarError/);
    }
  });

  it('ninguna borra el token ni navega a mano al login', () => {
    // Sin comentarios: uno de ellos EXPLICA que la pantalla no toca
    // SecureStore, y esa explicacion es justo lo que se quiere conservar.
    for (const { relativo, sinComentar } of FUENTES) {
      expect(sinComentar, relativo).not.toMatch(/borrarToken|SecureStore/);
      expect(sinComentar, relativo).not.toMatch(/router\.(replace|push)\(['"`]\/entrar/);
    }
  });

  it('cerrar sesion usa `salir()` del proveedor, no una version propia', () => {
    const perfil = FUENTES.find((f) => f.relativo === 'app/(tabs)/perfil.tsx')!;
    expect(perfil.sinComentar).toMatch(/void salir\(\)/);
    expect(perfil.sinComentar).not.toMatch(/api\.auth\.logout/);
  });
});
