import { describe, expect, it } from 'vitest';
import type { OwnRoutine, RoutineItem } from '@gymlab/contracts';
import {
  cuentaDeEjercicios,
  datosDeEjercicio,
  ejerciciosEnOrden,
  numeroDeEjercicio,
  tamanoDelValor,
  vistaDeRutina,
} from './logica';

function item(parcial: Partial<RoutineItem> & { position: number }): RoutineItem {
  return {
    id: `item-${parcial.position}`,
    exerciseId: null,
    exerciseName: `Ejercicio ${parcial.position}`,
    sets: 3,
    reps: '10',
    restSeconds: 90,
    notes: null,
    ...parcial,
  } as RoutineItem;
}

function rutina(id: string, nombre: string, items: RoutineItem[] = []): OwnRoutine {
  return {
    id,
    name: nombre,
    description: null,
    items,
    status: 'active',
    assignmentId: `asignacion-${id}`,
    assignedAt: '2026-08-19T22:29:17.703Z',
  } as OwnRoutine;
}

const FUERZA = rutina('fuerza', 'Fuerza principiantes', [item({ position: 1 }), item({ position: 2 })]);
const MOVILIDAD = rutina('movilidad', 'Movilidad de hombro', [item({ position: 1 })]);

describe('que se enseña, segun cuantas rutinas hay', () => {
  it('sin rutinas no hay nada que elegir ni que mirar', () => {
    expect(vistaDeRutina([], null)).toEqual({ tipo: 'sinRutinas' });
  });

  it('con UNA se entra directamente en su contenido, sin selector', () => {
    const vista = vistaDeRutina([FUERZA], null);
    expect(vista.tipo).toBe('mirando');
    if (vista.tipo !== 'mirando') return;
    expect(vista.mirada.id).toBe('fuerza');
    expect(vista.sePuedeCambiar).toBe(false);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LA PRUEBA QUE PROTEGE LA REGLA DE PRODUCTO.                             │
   * │                                                                          │
   * │ Con varias rutinas NO se abre ninguna. Si alguien "arregla" esto         │
   * │ abriendo la primera de la lista, esta prueba se pone roja: es el unico   │
   * │ sitio donde queda escrito que el modelo no tiene rutina principal.       │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('con VARIAS y sin eleccion previa NO abre ninguna: pide elegir', () => {
    const vista = vistaDeRutina([MOVILIDAD, FUERZA], null);
    expect(vista.tipo).toBe('eligiendo');
  });

  it('con VARIAS ofrece TODAS, en el orden en que llegan', () => {
    const vista = vistaDeRutina([MOVILIDAD, FUERZA], null);
    if (vista.tipo !== 'eligiendo') throw new Error('deberia estar eligiendo');
    expect(vista.rutinas.map((r) => r.id)).toEqual(['movilidad', 'fuerza']);
  });

  it('elegir una cambia el contenido que se mira', () => {
    const primera = vistaDeRutina([MOVILIDAD, FUERZA], 'movilidad');
    const segunda = vistaDeRutina([MOVILIDAD, FUERZA], 'fuerza');
    if (primera.tipo !== 'mirando' || segunda.tipo !== 'mirando') {
      throw new Error('deberian estar mirando');
    }
    expect(primera.mirada.name).toBe('Movilidad de hombro');
    expect(segunda.mirada.name).toBe('Fuerza principiantes');
  });

  it('mirando una de varias, el selector se queda para poder cambiar', () => {
    const vista = vistaDeRutina([MOVILIDAD, FUERZA], 'fuerza');
    if (vista.tipo !== 'mirando') throw new Error('deberia estar mirando');
    expect(vista.sePuedeCambiar).toBe(true);
  });

  it('un id que no corresponde a ninguna rutina devuelve a la eleccion', () => {
    expect(vistaDeRutina([MOVILIDAD, FUERZA], 'una-que-ya-no-esta').tipo).toBe('eligiendo');
  });

  it('con UNA sola, un id ajeno no impide verla: no hay nada que elegir', () => {
    const vista = vistaDeRutina([FUERZA], 'movilidad');
    expect(vista.tipo).toBe('mirando');
  });
});

describe('la seleccion sobrevive a un refresco, o se pierde bien', () => {
  it('si la rutina mirada sigue estando, se sigue mirando', () => {
    const antes = vistaDeRutina([MOVILIDAD, FUERZA], 'fuerza');
    // Llegan datos nuevos: la misma rutina, con un ejercicio mas.
    const conCambios = rutina('fuerza', 'Fuerza principiantes', [
      item({ position: 1 }),
      item({ position: 2 }),
      item({ position: 3 }),
    ]);
    const despues = vistaDeRutina([MOVILIDAD, conCambios], 'fuerza');

    if (antes.tipo !== 'mirando' || despues.tipo !== 'mirando') {
      throw new Error('deberian estar mirando');
    }
    expect(despues.mirada.id).toBe(antes.mirada.id);
    expect(despues.mirada.items).toHaveLength(3);
  });

  it('si el entrenador la retiro, se vuelve a la eleccion y NO a la primera', () => {
    const otra = rutina('tercera', 'Acondicionamiento');
    const despues = vistaDeRutina([MOVILIDAD, otra], 'fuerza');
    expect(despues.tipo).toBe('eligiendo');
  });

  it('si al retirarla queda UNA sola, se entra en la que queda', () => {
    const despues = vistaDeRutina([MOVILIDAD], 'fuerza');
    if (despues.tipo !== 'mirando') throw new Error('deberia estar mirando');
    expect(despues.mirada.id).toBe('movilidad');
  });

  it('si se retiran todas, estado vacio', () => {
    expect(vistaDeRutina([], 'fuerza').tipo).toBe('sinRutinas');
  });
});

describe('el orden de los ejercicios', () => {
  it('se ordena por `position`, aunque lleguen desordenados', () => {
    const desordenada = rutina('r', 'R', [
      item({ position: 3, exerciseName: 'Tercero' }),
      item({ position: 1, exerciseName: 'Primero' }),
      item({ position: 2, exerciseName: 'Segundo' }),
    ]);
    expect(ejerciciosEnOrden(desordenada).map((i) => i.exerciseName)).toEqual([
      'Primero',
      'Segundo',
      'Tercero',
    ]);
  });

  it('no modifica la rutina que recibe', () => {
    const original = rutina('r', 'R', [item({ position: 2 }), item({ position: 1 })]);
    ejerciciosEnOrden(original);
    expect(original.items.map((i) => i.position)).toEqual([2, 1]);
  });

  it('se numera por la posicion en la lista, con dos digitos', () => {
    expect(numeroDeEjercicio(0)).toBe('01');
    expect(numeroDeEjercicio(8)).toBe('09');
    expect(numeroDeEjercicio(9)).toBe('10');
    expect(numeroDeEjercicio(49)).toBe('50');
  });
});

describe('los numeros de un ejercicio', () => {
  it('series y repeticiones siempre; el descanso solo si existe', () => {
    const datos = datosDeEjercicio(item({ position: 1, sets: 4, reps: '10', restSeconds: 90 }));
    expect(datos.map((d) => d.etiqueta)).toEqual(['SERIES', 'REPS', 'DESCANSO']);
  });

  it('sin descanso, la columna no se reserva ni se rellena con un guion', () => {
    const datos = datosDeEjercicio(item({ position: 1, restSeconds: null }));
    expect(datos.map((d) => d.etiqueta)).toEqual(['SERIES', 'REPS']);
  });

  it('un descanso de 0 segundos SI se enseña: cero no es lo mismo que nada', () => {
    const datos = datosDeEjercicio(item({ position: 1, restSeconds: 0 }));
    expect(datos.map((d) => d.valor)).toContain('0 s');
  });

  /*
   * `reps` es `z.string()` en el contrato y `text` en la columna. En el fixture
   * de desarrollo ya conviven "8", "10", "12", "15" y "8-10".
   */
  it('las repeticiones se enseñan TAL CUAL: no se formatean ni se les pone unidad', () => {
    for (const reps of ['8', '8-10', 'al fallo', '30 s por lado', 'AMRAP']) {
      const datos = datosDeEjercicio(item({ position: 1, reps }));
      expect(datos.find((d) => d.etiqueta === 'REPS')?.valor).toBe(reps);
    }
  });

  it('el descanso acompaña; series y repeticiones mandan', () => {
    const datos = datosDeEjercicio(item({ position: 1, restSeconds: 60 }));
    expect(datos.map((d) => d.principal)).toEqual([true, true, false]);
  });
});

describe('lo que oye un lector de pantalla', () => {
  it('nunca es un numero suelto', () => {
    const datos = datosDeEjercicio(item({ position: 1, sets: 4, reps: '10', restSeconds: 90 }));
    expect(datos.map((d) => d.lectura)).toEqual([
      '4 series',
      '10 repeticiones',
      '90 segundos de descanso',
    ]);
    for (const dato of datos) expect(dato.lectura).not.toMatch(/^\d+$/);
  });

  it('el singular se dice en singular', () => {
    const datos = datosDeEjercicio(item({ position: 1, sets: 1, restSeconds: 1 }));
    expect(datos[0]?.lectura).toBe('1 serie');
    expect(datos[2]?.lectura).toBe('1 segundo de descanso');
  });
});

describe('el tamaño del valor, porque `reps` es texto libre', () => {
  const principal = (valor: string) => tamanoDelValor({ valor, principal: true });
  const descanso = (valor: string) => tamanoDelValor({ valor, principal: false });

  it('un valor corto va grande', () => {
    expect(principal('4')).toBe(28);
    expect(principal('8-10')).toBe(28);
  });

  it('cuanto mas largo, mas pequeño, y en este orden', () => {
    const escala = ['4', '8-10', 'al fallo', '30 s por lado', 'maximo tiempo posible'].map(
      principal,
    );
    for (let i = 1; i < escala.length; i++) {
      expect(escala[i]).toBeLessThanOrEqual(escala[i - 1] as number);
    }
  });

  it('nunca baja de 15: por debajo deja de leerse a un brazo de distancia', () => {
    // Los 30 caracteres que admite el contrato, y algo mas por si acaso.
    expect(principal('x'.repeat(30))).toBeGreaterThanOrEqual(15);
    expect(principal('x'.repeat(200))).toBeGreaterThanOrEqual(15);
  });

  it('no se rompe con espacios de mas', () => {
    expect(principal('  8  ')).toBe(principal('8'));
  });

  /*
   * Lo encontro la MEDICION, no una idea: con la escala por longitud, "60 s"
   * salia a 28 y "120 s" a 22, asi que la columna del descanso cambiaba de
   * tamaño de un ejercicio al siguiente al recorrer la lista.
   */
  it('el descanso va SIEMPRE al mismo tamaño, mida lo que mida', () => {
    expect(descanso('60 s')).toBe(descanso('120 s'));
    expect(descanso('0 s')).toBe(descanso('600 s'));
  });

  it('el descanso va mas pequeño que las series y las repeticiones', () => {
    expect(descanso('90 s')).toBeLessThan(principal('8'));
  });
});

describe('lo unico que se cuenta', () => {
  it('en singular y en plural', () => {
    expect(cuentaDeEjercicios(rutina('r', 'R', [item({ position: 1 })]))).toBe('1 ejercicio');
    expect(cuentaDeEjercicios(FUERZA)).toBe('2 ejercicios');
    expect(cuentaDeEjercicios(rutina('r', 'R'))).toBe('0 ejercicios');
  });
});
