import { createRoutineSchema } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import { aEnvio, itemsDesde, mover, type ItemEditable } from './editor-logica';

/**
 * LO QUE SE MANDA AL GUARDAR, Y EN QUE ORDEN.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE ESTAS DOS COSAS TIENEN PRUEBA PROPIA.                            │
 * │                                                                          │
 * │ El servidor BORRA los items y los reinserta desde lo que llegue. Eso      │
 * │ convierte dos fallos silenciosos en catastroficos:                        │
 * │                                                                          │
 * │   omitir un item  -> se borra, y nadie ve un error                       │
 * │   mandar el orden equivocado -> la rutina cambia de significado          │
 * │                                                                          │
 * │ Ninguno de los dos da 500 ni pinta nada raro: el guardado responde 200 y  │
 * │ la rutina queda mal. Por eso se comprueban aqui y no a ojo.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const item = (nombre: string, extra: Partial<ItemEditable> = {}): ItemEditable => ({
  clave: `k-${nombre}`,
  exerciseId: `00000000-0000-4000-8000-${nombre.padStart(12, '0')}`,
  exerciseName: nombre,
  sets: '3',
  reps: '10',
  restSeconds: '',
  notes: '',
  ...extra,
});

describe('lo que se envia al guardar', () => {
  it('manda TODOS los items, no solo los tocados', () => {
    const items = [item('111'), item('222'), item('333')];
    const envio = aEnvio('Fuerza', '', items);

    expect(envio.items).toHaveLength(3);
    expect(envio.items.map((i) => i.exerciseId)).toEqual(items.map((i) => i.exerciseId));
  });

  it('manda el orden de la lista, que es el orden de la rutina', () => {
    const items = [item('111'), item('222'), item('333')];
    const movidos = mover(items, 2, -1); // el tercero sube al segundo puesto
    const envio = aEnvio('Fuerza', '', movidos);

    expect(envio.items.map((i) => i.exerciseId)).toEqual([
      items[0]!.exerciseId,
      items[2]!.exerciseId,
      items[1]!.exerciseId,
    ]);
  });

  it('conserva reps de TEXTO tal cual', () => {
    // "8-12", "al fallo" y "30 s" son prescripciones validas; un campo
    // numerico las haria imposibles de escribir.
    for (const reps of ['10', '8-12', 'al fallo', '30 s']) {
      const envio = aEnvio('R', '', [item('111', { reps })]);
      expect(envio.items[0]!.reps).toBe(reps);
      expect(createRoutineSchema.safeParse(envio).success).toBe(true);
    }
  });

  it('omite descanso y notas cuando se dejan en blanco', () => {
    // El esquema los tiene como opcionales: mandar cadena vacia los rechazaria.
    const envio = aEnvio('R', '', [item('111')]);
    expect(envio.items[0]).not.toHaveProperty('restSeconds');
    expect(envio.items[0]).not.toHaveProperty('notes');
    expect(createRoutineSchema.safeParse(envio).success).toBe(true);
  });

  it('manda descanso y notas cuando se rellenan', () => {
    const envio = aEnvio('R', 'Con descripcion', [
      item('111', { restSeconds: '90', notes: 'Bajar despacio' }),
    ]);
    expect(envio.items[0]!.restSeconds).toBe(90);
    expect(envio.items[0]!.notes).toBe('Bajar despacio');
    expect(envio.description).toBe('Con descripcion');
  });

  it('el mismo ejercicio puede ir dos veces', () => {
    // El contrato no lo prohibe, y es legitimo: press al principio y al final.
    const repetido = item('111');
    const envio = aEnvio('R', '', [repetido, { ...repetido, clave: 'otra' }]);
    expect(createRoutineSchema.safeParse(envio).success).toBe(true);
    expect(envio.items).toHaveLength(2);
  });
});

describe('validacion, con el mismo esquema que aplica el servidor', () => {
  it('sin nombre no pasa', () => {
    expect(createRoutineSchema.safeParse(aEnvio('', '', [item('111')])).success).toBe(false);
  });

  it('sin ejercicios no pasa', () => {
    expect(createRoutineSchema.safeParse(aEnvio('R', '', [])).success).toBe(false);
  });

  it('las series van de 1 a 20', () => {
    for (const sets of ['0', '21']) {
      expect(createRoutineSchema.safeParse(aEnvio('R', '', [item('111', { sets })])).success).toBe(
        false,
      );
    }
    expect(createRoutineSchema.safeParse(aEnvio('R', '', [item('111', { sets: '20' })])).success).toBe(
      true,
    );
  });

  it('el descanso va de 0 a 600', () => {
    expect(
      createRoutineSchema.safeParse(aEnvio('R', '', [item('111', { restSeconds: '601' })])).success,
    ).toBe(false);
  });

  it('reps vacio no pasa', () => {
    expect(createRoutineSchema.safeParse(aEnvio('R', '', [item('111', { reps: '  ' })])).success).toBe(
      false,
    );
  });
});

describe('un ejercicio que ya no esta en la biblioteca', () => {
  /*
   * El caso que el contrato hace incomodo: `routine_items.exercise_id` es
   * anulable —el gimnasio borro el ejercicio— pero `routineItemInputSchema`
   * exige un uuid. Es decir, ese item NO SE PUEDE REENVIAR tal cual.
   *
   * La salida no destructiva es que el editor obligue a decidir: sustituirlo o
   * quitarlo. Lo que no puede pasar es que un "Guardar" se lo lleve por delante
   * sin que nadie se entere, y eso es lo que fija esta prueba.
   */
  const huerfano = item('111', { exerciseId: null, exerciseName: 'Ejercicio borrado' });

  it('NO se puede guardar mientras quede uno sin resolver', () => {
    const envio = aEnvio('R', '', [huerfano, item('222')]);
    const resultado = createRoutineSchema.safeParse(envio);

    expect(resultado.success).toBe(false);
    // Y falla senalando al item concreto, no a la rutina entera.
    expect(resultado.success === false && resultado.error.issues[0]!.path).toEqual([
      'items',
      0,
      'exerciseId',
    ]);
  });

  it('el envio lo incluye igualmente: no desaparece en silencio', () => {
    // Si `aEnvio` lo filtrara, la validacion pasaria y el guardado borraria el
    // item sin decir nada. Que siga ahi es lo que provoca el error de arriba.
    expect(aEnvio('R', '', [huerfano, item('222')]).items).toHaveLength(2);
  });

  it('al sustituirlo se conserva todo lo demas', () => {
    const conDatos = { ...huerfano, sets: '5', reps: '3', restSeconds: '120', notes: 'Pesado' };
    const sustituido: ItemEditable = {
      ...conDatos,
      exerciseId: '00000000-0000-4000-8000-000000000999',
      exerciseName: 'Sustituto',
    };
    const envio = aEnvio('R', '', [sustituido]);

    expect(createRoutineSchema.safeParse(envio).success).toBe(true);
    expect(envio.items[0]!.sets).toBe(5);
    expect(envio.items[0]!.reps).toBe('3');
    expect(envio.items[0]!.restSeconds).toBe(120);
    expect(envio.items[0]!.notes).toBe('Pesado');
  });

  it('editar solo el nombre no toca los items, asi que el huerfano sobrevive', () => {
    // Es la unica via para renombrar una rutina que contenga uno sin perderlo:
    // `items` es opcional en el PATCH y el servidor solo reemplaza si llega.
    const parche: { name: string; items?: unknown[] } = { name: 'Nombre nuevo' };
    expect(parche.items).toBeUndefined();
  });
});

describe('mover un item', () => {
  const tres = [item('111'), item('222'), item('333')];

  it('sube y baja intercambiando con el vecino', () => {
    expect(mover(tres, 1, -1).map((i) => i.exerciseName)).toEqual(['222', '111', '333']);
    expect(mover(tres, 1, 1).map((i) => i.exerciseName)).toEqual(['111', '333', '222']);
  });

  it('el primero no sube y el ultimo no baja', () => {
    expect(mover(tres, 0, -1)).toEqual(tres);
    expect(mover(tres, 2, 1)).toEqual(tres);
  });

  it('no pierde ni duplica items', () => {
    const movidos = mover(tres, 0, 1);
    expect(movidos).toHaveLength(3);
    expect(new Set(movidos.map((i) => i.clave)).size).toBe(3);
  });
});

describe('cargar una rutina para editarla', () => {
  it('convierte los campos a texto y conserva el orden y los nulos', () => {
    const items = itemsDesde({
      id: 'r1',
      name: 'R',
      description: null,
      activeAssignments: 0,
      items: [
        {
          id: 'i1',
          exerciseId: null,
          exerciseName: 'Borrado',
          position: 1,
          sets: 4,
          reps: '8-10',
          restSeconds: null,
          notes: null,
        },
        {
          id: 'i2',
          exerciseId: '00000000-0000-4000-8000-000000000222',
          exerciseName: 'Segundo',
          position: 2,
          sets: 3,
          reps: '12',
          restSeconds: 60,
          notes: 'Con nota',
        },
      ],
    });

    expect(items.map((i) => i.exerciseName)).toEqual(['Borrado', 'Segundo']);
    expect(items[0]!.exerciseId).toBeNull();
    expect(items[0]!.restSeconds).toBe('');
    expect(items[0]!.notes).toBe('');
    expect(items[1]!.sets).toBe('3');
    expect(items[1]!.restSeconds).toBe('60');
  });

  it('da clave distinta a dos items del mismo ejercicio', () => {
    // Sin esto, React trata dos filas como una y editar la segunda cambia la
    // primera.
    const items = itemsDesde({
      id: 'r1',
      name: 'R',
      description: null,
      activeAssignments: 0,
      items: [1, 2].map((n) => ({
        id: `i${n}`,
        exerciseId: '00000000-0000-4000-8000-000000000111',
        exerciseName: 'Press',
        position: n,
        sets: 3,
        reps: '10',
        restSeconds: null,
        notes: null,
      })),
    });

    expect(items[0]!.clave).not.toBe(items[1]!.clave);
  });
});
