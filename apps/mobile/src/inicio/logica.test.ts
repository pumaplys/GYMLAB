import { describe, expect, it } from 'vitest';
import type { BodyMetric, DuesStatus, Member, OwnRoutine } from '@gymlab/contracts';
import {
  EJERCICIOS_DE_MUESTRA,
  fechaCivil,
  fechaDeInstante,
  inicioEsUtil,
  presentacionDeRutinas,
  resumenDeProgreso,
  saludo,
  type DatosDeInicio,
} from './logica';

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

function item(nombre: string, position: number, sets = 3, reps = '10') {
  return {
    id: `eeeeeeee-eeee-4eee-8eee-${String(position).padStart(12, '0')}`,
    exerciseId: null,
    exerciseName: nombre,
    position,
    sets,
    reps,
    restSeconds: 60,
    notes: null,
  };
}

function rutina(nombre: string, ejercicios: ReturnType<typeof item>[], id = '1'): OwnRoutine {
  return {
    id: `1111111${id}-1111-4111-8111-111111111111`,
    name: nombre,
    description: null,
    items: ejercicios,
    status: 'active',
    assignmentId: '22222222-2222-4222-8222-222222222222',
    assignedAt: '2026-08-19T09:00:00.000Z',
  } as OwnRoutine;
}

function medicion(parcial: Partial<BodyMetric>): BodyMetric {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    measuredAt: '2026-08-24',
    weightKg: null,
    bodyFatPercent: null,
    chestCm: null,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    notes: null,
    consentVersion: 'v1',
    ...parcial,
  } as BodyMetric;
}

describe('el saludo', () => {
  it('cambia con la hora del telefono', () => {
    expect(saludo('Lucia', 8)).toBe('Buenos días, Lucia');
    expect(saludo('Lucia', 15)).toBe('Buenas tardes, Lucia');
    expect(saludo('Lucia', 22)).toBe('Buenas noches, Lucia');
  });

  it('los limites caen donde se espera', () => {
    expect(saludo('L', 11)).toMatch(/días/);
    expect(saludo('L', 12)).toMatch(/tardes/);
    expect(saludo('L', 19)).toMatch(/tardes/);
    expect(saludo('L', 20)).toMatch(/noches/);
  });

  it('a las cuatro de la mañana no dice nada raro', () => {
    // Quien entrena a esa hora no necesita que la app se lo comente.
    expect(saludo('L', 4)).toBe('Buenos días, L');
  });

  it('sin nombre no deja una coma colgando', () => {
    expect(saludo('')).not.toMatch(/,$/);
    expect(saludo('   ')).not.toMatch(/,/);
  });
});

describe('las rutinas', () => {
  it('sin ninguna asignada lo dice, no finge una', () => {
    expect(presentacionDeRutinas([])).toEqual({ tipo: 'ninguna' });
  });

  it('con UNA se enseña con vista previa de ejercicios', () => {
    const p = presentacionDeRutinas([
      rutina('Fuerza', [item('Sentadilla', 1, 4, '8'), item('Press', 2), item('Remo', 3)]),
    ]);
    expect(p.tipo).toBe('una');
    if (p.tipo !== 'una') throw new Error('tipo inesperado');
    expect(p.rutina.nombre).toBe('Fuerza');
    expect(p.rutina.ejercicios).toBe(3);
    expect(p.muestra[0]).toEqual({ nombre: 'Sentadilla', series: '4 x 8' });
  });

  it('la vista previa respeta el orden que decidio quien la escribio', () => {
    const p = presentacionDeRutinas([
      rutina('Fuerza', [item('Tercero', 3), item('Primero', 1), item('Segundo', 2)]),
    ]);
    if (p.tipo !== 'una') throw new Error('tipo inesperado');
    expect(p.muestra.map((e) => e.nombre)).toEqual(['Primero', 'Segundo', 'Tercero']);
  });

  it('la vista previa se corta: Inicio no enseña la rutina entera', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => item(`Ejercicio ${i + 1}`, i + 1));
    const p = presentacionDeRutinas([rutina('Larga', muchos)]);
    if (p.tipo !== 'una') throw new Error('tipo inesperado');
    expect(p.muestra).toHaveLength(EJERCICIOS_DE_MUESTRA);
    // Pero el recuento sigue siendo el de verdad.
    expect(p.rutina.ejercicios).toBe(12);
  });

  it('con VARIAS no se elige ninguna: se devuelven todas', () => {
    // El modelo no tiene rutina principal, y en el fixture las dos estaban
    // asignadas el mismo dia: ni "la mas reciente" desempata.
    const p = presentacionDeRutinas([
      rutina('Movilidad', [item('A', 1)], '1'),
      rutina('Fuerza', [item('B', 1), item('C', 2)], '2'),
    ]);
    expect(p.tipo).toBe('varias');
    if (p.tipo !== 'varias') throw new Error('tipo inesperado');
    expect(p.rutinas.map((r) => r.nombre)).toEqual(['Movilidad', 'Fuerza']);
    expect(p.rutinas.map((r) => r.ejercicios)).toEqual([1, 2]);
  });

  it('con varias NO aparece ninguna vista previa de ejercicios', () => {
    const p = presentacionDeRutinas([
      rutina('A', [item('x', 1)], '1'),
      rutina('B', [item('y', 1)], '2'),
    ]);
    expect('muestra' in p).toBe(false);
  });

  it('respeta el orden en el que llegan: no las reordena por su cuenta', () => {
    const p = presentacionDeRutinas([
      rutina('Segunda', [item('a', 1)], '2'),
      rutina('Primera', [item('b', 1)], '1'),
    ]);
    if (p.tipo !== 'varias') throw new Error('tipo inesperado');
    expect(p.rutinas[0]?.nombre).toBe('Segunda');
  });
});

describe('el progreso', () => {
  it('sin mediciones no hay resumen', () => {
    expect(resumenDeProgreso([])).toEqual({ tipo: 'ninguno' });
  });

  it('coge la mas reciente por FECHA, no por posicion en el array', () => {
    const r = resumenDeProgreso([
      medicion({ measuredAt: '2026-07-01', weightKg: 80 }),
      medicion({ measuredAt: '2026-08-24', weightKg: 71.4 }),
    ]);
    if (r.tipo !== 'ultima') throw new Error('tipo inesperado');
    expect(r.fecha).toBe('2026-08-24');
    expect(r.medidas[0]?.valor).toBe('71.4 kg');
  });

  it('solo enseña las medidas que tienen valor', () => {
    const r = resumenDeProgreso([medicion({ weightKg: 71.4, bodyFatPercent: null, waistCm: 79 })]);
    if (r.tipo !== 'ultima') throw new Error('tipo inesperado');
    expect(r.medidas.map((m) => m.etiqueta)).toEqual(['Peso', 'Cintura']);
  });

  it('una medicion con SOLO perimetros que no se enseñan no cuenta', () => {
    // Una fecha suelta sin ningun numero no es informacion.
    expect(resumenDeProgreso([medicion({ armCm: 33, thighCm: 55 })])).toEqual({ tipo: 'ninguno' });
  });

  it('NO dice si va mejor o peor: no compara', () => {
    const r = resumenDeProgreso([
      medicion({ measuredAt: '2026-08-24', weightKg: 71.4 }),
      medicion({ measuredAt: '2026-07-27', weightKg: 72.8 }),
    ]);
    if (r.tipo !== 'ultima') throw new Error('tipo inesperado');
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/mejor|peor|subi|baja|-1\.4|\+|%↓|tendencia/i);
    // Y solo aparece la ultima: la anterior no se enseña ni para comparar.
    expect(texto).not.toContain('72.8');
  });

  it('nunca enseña mas de tres medidas', () => {
    const r = resumenDeProgreso([
      medicion({ weightKg: 71, bodyFatPercent: 18, waistCm: 79, hipCm: 95, chestCm: 100 }),
    ]);
    if (r.tipo !== 'ultima') throw new Error('tipo inesperado');
    expect(r.medidas.length).toBeLessThanOrEqual(3);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTAS PRUEBAS SE EJECUTAN EN TRES HUSOS, NO EN EL DE LA MAQUINA.        │
 * │                                                                          │
 * │ La version anterior comprobaba lo mismo pero solo en el huso del que      │
 * │ ejecutara: cambiando la implementacion por una basada en `new Date()`    │
 * │ pasaban igual en Europe/Paris y fallaban en America/Los_Angeles. Es      │
 * │ decir, en esta maquina y en un CI en UTC no protegian de nada.           │
 * │                                                                          │
 * │ Node permite mover `process.env.TZ` en caliente, asi que cada caso corre │
 * │ en UTC, en Madrid (+1/+2) y en Los Angeles (-7/-8). Se restaura el huso  │
 * │ original al terminar.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HUSOS = ['UTC', 'Europe/Madrid', 'America/Los_Angeles'] as const;

/** Ejecuta algo en cada huso, y deja el original como estaba. */
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

describe('una fecha CIVIL es el mismo dia en todo el mundo', () => {
  it('el huso de la maquina se puede mover: la propia prueba lo comprueba', () => {
    // Si esto fallara, todo lo de abajo seria decorativo.
    enCadaHuso(() => undefined);
    const original = process.env.TZ;
    process.env.TZ = 'UTC';
    const enUtc = new Date('2026-01-01').getDate();
    process.env.TZ = 'America/Los_Angeles';
    const enLa = new Date('2026-01-01').getDate();
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;

    expect(enUtc).toBe(1);
    expect(enLa).toBe(31);
  });

  it('2026-09-03 es "3 sep 2026" en los tres husos', () => {
    enCadaHuso((huso) => {
      expect(fechaCivil('2026-09-03'), `en ${huso}`).toBe('3 sep 2026');
    });
  });

  it('el primero de enero no se convierte en 31 de diciembre', () => {
    enCadaHuso((huso) => {
      expect(fechaCivil('2026-01-01'), `en ${huso}`).toBe('1 ene 2026');
    });
  });

  it('el ultimo dia del año no se convierte en el primero del siguiente', () => {
    enCadaHuso((huso) => {
      expect(fechaCivil('2026-12-31'), `en ${huso}`).toBe('31 dic 2026');
    });
  });

  it('`hasta` del contrato, que es lo que de verdad se formatea asi', () => {
    enCadaHuso((huso) => {
      expect(fechaCivil(CUOTA.hasta as string), `en ${huso}`).toBe('20 sep 2026');
    });
  });

  it('ante algo que no es una fecha, devuelve lo que le dieron', () => {
    expect(fechaCivil('vaya')).toBe('vaya');
  });

  it('NO construye ninguna fecha: se comprueba quitandole `Date`', () => {
    // La prueba mas fuerte de las tres, y la unica que no depende del huso: si
    // la implementacion tocara `Date`, esto revienta en cualquier maquina.
    const original = globalThis.Date;
    try {
      // @ts-expect-error se sustituye a proposito para que falle si se usa
      globalThis.Date = function () {
        throw new Error('fechaCivil no debe construir fechas');
      };
      expect(fechaCivil('2026-09-03')).toBe('3 sep 2026');
    } finally {
      globalThis.Date = original;
    }
  });
});

describe('un INSTANTE si se dice en la hora de quien mira', () => {
  it('el mismo instante cae en dias distintos segun el huso, y eso es correcto', () => {
    // 2026-08-25T02:00:00Z: en Madrid son las 04:00 del 25; en Los Angeles,
    // las 19:00 del 24. Una medicion registrada de madrugada tiene que
    // aparecer con el dia que vivio quien se peso.
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      expect(fechaDeInstante('2026-08-25T02:00:00.000Z')).toBe('25 ago 2026');
      process.env.TZ = 'Europe/Madrid';
      expect(fechaDeInstante('2026-08-25T02:00:00.000Z')).toBe('25 ago 2026');
      process.env.TZ = 'America/Los_Angeles';
      expect(fechaDeInstante('2026-08-25T02:00:00.000Z')).toBe('24 ago 2026');
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('a mediodia UTC coincide en los tres husos', () => {
    enCadaHuso((huso) => {
      expect(fechaDeInstante('2026-08-24T12:00:00.000Z'), `en ${huso}`).toBe('24 ago 2026');
    });
  });

  it('ante algo que no es una fecha, devuelve lo que le dieron', () => {
    expect(fechaDeInstante('vaya')).toBe('vaya');
  });
});

describe('un fallo secundario no tumba Inicio', () => {
  const base: DatosDeInicio = {
    esenciales: { estado: 'ok', datos: { ficha: FICHA, cuota: CUOTA } },
    rutinas: { estado: 'ok', datos: [] },
    progreso: { estado: 'ok', datos: [] },
  };

  it('con lo esencial cargado, Inicio sirve', () => {
    expect(inicioEsUtil(base)).toBe(true);
  });

  it('si fallan las rutinas, Inicio SIGUE sirviendo', () => {
    expect(inicioEsUtil({ ...base, rutinas: { estado: 'fallo' } })).toBe(true);
  });

  it('si falla el progreso, Inicio SIGUE sirviendo', () => {
    expect(inicioEsUtil({ ...base, progreso: { estado: 'fallo' } })).toBe(true);
  });

  it('si fallan las dos secundarias, Inicio SIGUE sirviendo', () => {
    expect(
      inicioEsUtil({ ...base, rutinas: { estado: 'fallo' }, progreso: { estado: 'fallo' } }),
    ).toBe(true);
  });

  it('solo lo esencial la tumba', () => {
    expect(inicioEsUtil({ ...base, esenciales: { estado: 'fallo' } })).toBe(false);
  });

  it('mientras lo esencial carga, todavia no sirve', () => {
    expect(inicioEsUtil({ ...base, esenciales: { estado: 'cargando' } })).toBe(false);
  });
});
