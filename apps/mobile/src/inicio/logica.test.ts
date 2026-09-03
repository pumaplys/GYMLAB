import { describe, expect, it } from 'vitest';
import type { BodyMetric, DuesStatus, Member, OwnRoutine } from '@gymlab/contracts';
import {
  EJERCICIOS_DE_MUESTRA,
  fechaCorta,
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
    expect(saludo('Lucia', 8)).toBe('Buenos dias, Lucia');
    expect(saludo('Lucia', 15)).toBe('Buenas tardes, Lucia');
    expect(saludo('Lucia', 22)).toBe('Buenas noches, Lucia');
  });

  it('los limites caen donde se espera', () => {
    expect(saludo('L', 11)).toMatch(/dias/);
    expect(saludo('L', 12)).toMatch(/tardes/);
    expect(saludo('L', 19)).toMatch(/tardes/);
    expect(saludo('L', 20)).toMatch(/noches/);
  });

  it('a las cuatro de la mañana no dice nada raro', () => {
    // Quien entrena a esa hora no necesita que la app se lo comente.
    expect(saludo('L', 4)).toBe('Buenos dias, L');
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
 * │ ESTAS DOS PRUEBAS SOLO MUERDEN AL OESTE DE GREENWICH.                   │
 * │                                                                          │
 * │ Se falsificaron cambiando `fechaCorta` por una version con `new Date()`: │
 * │                                                                          │
 * │   Europe/Paris (+2)        159 pasan  -> la prueba NO detecta el fallo   │
 * │   America/Los_Angeles (-7)   2 fallan -> la prueba SI lo detecta         │
 * │                                                                          │
 * │ Asi que en esta maquina —y en un CI en UTC— no protegen de nada. Lo que  │
 * │ protege de verdad es la implementacion: parte la cadena y no construye   │
 * │ ninguna fecha, asi que no hay huso que la mueva. Estas pruebas fijan ese │
 * │ contrato para quien lea el codigo, y se disparan de verdad en cuanto     │
 * │ alguien las ejecute con TZ al oeste.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('las fechas se dicen como las dijo el servidor', () => {
  it('formatea en corto', () => {
    expect(fechaCorta('2026-09-20')).toBe('20 sep 2026');
    expect(fechaCorta('2026-01-05')).toBe('5 ene 2026');
  });

  it('no mueve el dia por el huso horario', () => {
    // Pasar '2026-01-01' por `new Date()` y leer el dia local lo deja en 31 de
    // diciembre en cualquier huso al oeste de Greenwich.
    expect(fechaCorta('2026-01-01')).toBe('1 ene 2026');
    expect(fechaCorta('2026-12-31')).toBe('31 dic 2026');
  });

  it('acepta una fecha con hora, como `measuredAt`', () => {
    expect(fechaCorta('2026-08-24T09:30:00.000Z')).toBe('24 ago 2026');
  });

  it('ante algo que no es una fecha, devuelve lo que le dieron', () => {
    expect(fechaCorta('vaya')).toBe('vaya');
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
