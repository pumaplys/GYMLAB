import type { CreateRoutineInput, Routine } from '@gymlab/contracts';
import { createRoutineSchema } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import { anadir, aEnvio, cambiar, itemsDesde, mensajeDe, mover, quitar, sustituir } from './editor';
/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE IMPORTA EL EDITOR DEL PANEL WEB, POR RUTA RELATIVA.                   │
 * │                                                                          │
 * │ No es un descuido ni una dependencia nueva: `apps/web` no esta en el     │
 * │ `package.json` del movil y esto vive SOLO en un test. Se hace porque lo  │
 * │ que se quiere comprobar es precisamente que las dos implementaciones     │
 * │ construyen el mismo envio, y eso no se puede comprobar mirando una sola. │
 * │                                                                          │
 * │ El modulo del panel solo importa TIPOS del contrato, asi que traerlo     │
 * │ aqui no arrastra React ni Next.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import * as web from '../../../web/src/app/entrenador/rutinas/editor-logica';

/**
 * El editor de rutinas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ GUARDAR REEMPLAZA LA LISTA ENTERA EN EL SERVIDOR.                        │
 * │                                                                          │
 * │ `updateRoutineSchema` acepta `items` completo y el servicio borra los    │
 * │ que habia y reinserta lo que llega. Omitir uno lo BORRA; mandarlos       │
 * │ desordenados CAMBIA la rutina. Las dos cosas responden 200.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RUTINA: Routine = {
  id: 'r1',
  name: 'Fuerza',
  description: 'Tres días',
  activeAssignments: 2,
  status: 'active',
  items: [
    {
      id: 'i1',
      exerciseId: '11111111-1111-4111-8111-111111111111',
      exerciseName: 'Press de banca',
      position: 0,
      sets: 4,
      reps: '8-10',
      restSeconds: 90,
      notes: null,
    },
    {
      id: 'i2',
      exerciseId: null,
      exerciseName: 'Ejercicio borrado',
      position: 1,
      sets: 3,
      reps: '12',
      restSeconds: null,
      notes: 'Con cuidado',
    },
  ],
};

describe('cargar una rutina al editor', () => {
  it('trae los dos ejercicios, en su orden y con sus valores', () => {
    const items = itemsDesde(RUTINA);
    expect(items).toHaveLength(2);
    expect(items[0]?.exerciseName).toBe('Press de banca');
    expect(items[0]?.sets).toBe('4');
    expect(items[0]?.restSeconds).toBe('90');
    // Sin descanso NO es «0»: es que no se prescribio ninguno.
    expect(items[1]?.restSeconds).toBe('');
    expect(items[1]?.notes).toBe('Con cuidado');
  });

  /*
   * Dos filas pueden apuntar al mismo ejercicio —press al principio y al
   * final es una prescripcion normal—, asi que la clave no puede ser el
   * ejercicio: editar una cambiaria las dos.
   */
  it('cada fila tiene clave propia aunque repitan ejercicio', () => {
    const repetido: Routine = {
      ...RUTINA,
      items: [RUTINA.items[0]!, { ...RUTINA.items[0]!, id: 'i9', position: 1 }],
    };
    const items = itemsDesde(repetido);
    expect(items[0]?.clave).not.toBe(items[1]?.clave);
  });

  it('un ejercicio que ya no esta en la biblioteca conserva su nombre', () => {
    expect(itemsDesde(RUTINA)[1]?.exerciseId).toBeNull();
    expect(itemsDesde(RUTINA)[1]?.exerciseName).toBe('Ejercicio borrado');
  });
});

describe('mover, anadir y quitar', () => {
  const items = itemsDesde(RUTINA);

  it('subir el segundo lo pone primero', () => {
    const movidos = mover(items, 1, -1);
    expect(movidos.map((i) => i.exerciseName)).toEqual(['Ejercicio borrado', 'Press de banca']);
  });

  it('el primero no sube y el ultimo no baja', () => {
    expect(mover(items, 0, -1).map((i) => i.clave)).toEqual(items.map((i) => i.clave));
    expect(mover(items, 1, 1).map((i) => i.clave)).toEqual(items.map((i) => i.clave));
  });

  it('mover no pierde ni duplica filas', () => {
    const movidos = mover(items, 1, -1);
    expect(movidos).toHaveLength(items.length);
    expect(new Set(movidos.map((i) => i.clave)).size).toBe(items.length);
  });

  it('anadir deja la fila al final, con valores de partida usables', () => {
    const conMas = anadir(items, { id: 'e5', name: 'Zancadas' }, 'k5');
    expect(conMas).toHaveLength(3);
    expect(conMas[2]?.exerciseName).toBe('Zancadas');
    // Vacio dejaria la rutina invalida sin que nadie lo pidiera.
    expect(conMas[2]?.sets).toBe('3');
    expect(conMas[2]?.reps).toBe('10');
  });

  it('quitar va por clave, no por indice', () => {
    const clave = items[0]!.clave;
    expect(quitar(items, clave).map((i) => i.clave)).toEqual([items[1]!.clave]);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ SUSTITUIR ES LA UNICA SALIDA QUE NO PIERDE TRABAJO.                  │
   * │                                                                      │
   * │ Cuando el gimnasio borra un ejercicio, la rutina que lo usaba deja de │
   * │ poder guardarse: el esquema exige un `exerciseId` valido. Si la unica │
   * │ opcion fuera «quitalo», se perderian las series, las repeticiones, el │
   * │ descanso y las notas, que las escribio alguien.                       │
   * │                                                                      │
   * │ El panel web tiene «Elegir sustituto» desde siempre. Se comprobo       │
   * │ leyendo su editor, y por eso esta capacidad no se recorto en el movil.│
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('sustituir cambia el ejercicio y CONSERVA todo lo demas', () => {
    const huerfano = items[1]!;
    expect(huerfano.exerciseId).toBeNull();
    const cambiados = sustituir(items, huerfano.clave, { id: 'e7', name: 'Jalón al pecho' });
    const nuevo = cambiados[1]!;
    expect(nuevo.exerciseId).toBe('e7');
    expect(nuevo.exerciseName).toBe('Jalón al pecho');
    // Lo que escribio alguien sigue ahi.
    expect(nuevo.sets).toBe(huerfano.sets);
    expect(nuevo.reps).toBe(huerfano.reps);
    expect(nuevo.restSeconds).toBe(huerfano.restSeconds);
    expect(nuevo.notes).toBe('Con cuidado');
  });

  it('sustituir no mueve la fila de sitio ni toca las demas', () => {
    const cambiados = sustituir(items, items[1]!.clave, { id: 'e7', name: 'Otro' });
    expect(cambiados.map((i) => i.clave)).toEqual(items.map((i) => i.clave));
    expect(cambiados[0]).toEqual(items[0]);
  });

  /*
   * Y la consecuencia que importa: despues de sustituir, la rutina VUELVE a
   * poder guardarse. Sin esto, la capacidad seria un boton que no arregla nada.
   */
  it('despues de sustituir, la rutina ya pasa la validacion', () => {
    const antes = aEnvio('Fuerza', '', items);
    expect(createRoutineSchema.safeParse(antes).success).toBe(false);
    const arreglados = sustituir(items, items[1]!.clave, {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Jalón al pecho',
    });
    const despues = aEnvio('Fuerza', '', arreglados);
    expect(createRoutineSchema.safeParse(despues).success).toBe(true);
  });

  it('cambiar un campo no toca las otras filas', () => {
    const cambiados = cambiar(items, items[1]!.clave, 'sets', '5');
    expect(cambiados[1]?.sets).toBe('5');
    expect(cambiados[0]).toEqual(items[0]);
  });
});

describe('lo que se manda al servidor', () => {
  it('van TODOS los items, y en el orden de la pantalla', () => {
    const movidos = mover(itemsDesde(RUTINA), 1, -1);
    const envio = aEnvio('Fuerza', '', movidos);
    expect(envio.items).toHaveLength(2);
    expect(envio.items[0]?.reps).toBe('12');
    expect(envio.items[1]?.reps).toBe('8-10');
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN EJERCICIO BORRADO DE LA BIBLIOTECA NO SE FILTRA: SE MANDA VACIO.  │
   * │                                                                      │
   * │ Filtrarlo aqui haria pasar el esquema y el guardado lo borraria en    │
   * │ silencio. Mandandolo vacio, la validacion lo rechaza señalando cual   │
   * │ es y quien edita decide: sustituirlo o quitarlo a proposito.          │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('el ejercicio que ya no existe se manda vacio para que lo rechacen', () => {
    const envio = aEnvio('Fuerza', '', itemsDesde(RUTINA));
    expect(envio.items).toHaveLength(2);
    expect(envio.items[1]?.exerciseId).toBe('');
    const resultado = createRoutineSchema.safeParse(envio);
    expect(resultado.success).toBe(false);
  });

  it('sin descanso y sin notas, esos campos no viajan', () => {
    const envio = aEnvio('Fuerza', '', [
      { clave: 'k', exerciseId: '11111111-1111-4111-8111-111111111111', exerciseName: 'x', sets: '3', reps: '10', restSeconds: '', notes: '' },
    ]);
    expect(envio.items[0]).not.toHaveProperty('restSeconds');
    expect(envio.items[0]).not.toHaveProperty('notes');
    expect(createRoutineSchema.safeParse(envio).success).toBe(true);
  });

  it('una descripcion vacia tampoco viaja', () => {
    const uno = [
      { clave: 'k', exerciseId: '11111111-1111-4111-8111-111111111111', exerciseName: 'x', sets: '3', reps: '10', restSeconds: '', notes: '' },
    ];
    expect(aEnvio('Fuerza', '   ', uno)).not.toHaveProperty('description');
    expect(aEnvio('Fuerza', ' Tres días ', uno).description).toBe('Tres días');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS DOS PANTALLAS TIENEN QUE GUARDAR LA MISMA RUTINA.                    │
 * │                                                                          │
 * │ El editor del panel web y este son dos implementaciones de la misma      │
 * │ decision. Si se separaran, la misma rutina se guardaria distinta segun   │
 * │ se editara desde el ordenador o desde el telefono — y como el guardado   │
 * │ REEMPLAZA los items, esa diferencia se lleva ejercicios por delante.     │
 * │                                                                          │
 * │ No se comprueban los mensajes: en el movil llevan tildes («añade»,       │
 * │ «quítalo») y en el panel no. Es copy visible, y la convencion del        │
 * │ repositorio es que la copy visible lleve tildes.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('el movil y el panel construyen el mismo envio', () => {
  it('cargar la rutina da exactamente los mismos items', () => {
    expect(itemsDesde(RUTINA)).toEqual(web.itemsDesde(RUTINA));
  });

  it('mover produce el mismo resultado, tambien en los bordes', () => {
    const mios = itemsDesde(RUTINA);
    for (const [indice, direccion] of [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
    ] as const) {
      expect(mover(mios, indice, direccion), `${indice} ${direccion}`).toEqual(
        web.mover(mios, indice, direccion),
      );
    }
  });

  it('el envio es identico, con y sin campos opcionales', () => {
    const casos: [string, string, ReturnType<typeof itemsDesde>][] = [
      ['Fuerza', 'Tres días', itemsDesde(RUTINA)],
      ['  Fuerza  ', '   ', itemsDesde(RUTINA)],
      ['Movilidad', '', mover(itemsDesde(RUTINA), 1, -1)],
    ];
    for (const [nombre, descripcion, items] of casos) {
      const mio: CreateRoutineInput = aEnvio(nombre, descripcion, items);
      expect(mio, nombre).toEqual(web.aEnvio(nombre, descripcion, items));
    }
  });
});

describe('los avisos de validacion', () => {
  it('cada error del esquema tiene una frase que se entiende', () => {
    expect(mensajeDe(['name'], 'x')).toMatch(/nombre/);
    expect(mensajeDe(['items'], 'x')).toMatch(/al menos un ejercicio/);
    expect(mensajeDe(['items', 0, 'sets'], 'x')).toMatch(/ejercicio 1.*1 a 20/);
    expect(mensajeDe(['items', 2, 'exerciseId'], 'x')).toMatch(/ejercicio 3.*biblioteca/);
    expect(mensajeDe(['items', 1, 'restSeconds'], 'x')).toMatch(/ejercicio 2.*600/);
  });

  it('las posiciones se cuentan desde uno, como en pantalla', () => {
    expect(mensajeDe(['items', 0, 'reps'], 'x')).toContain('ejercicio 1');
  });

  it('ninguna frase enseña el nombre del campo del esquema', () => {
    for (const ruta of [['name'], ['items'], ['items', 0, 'sets'], ['items', 0, 'restSeconds']]) {
      expect(mensajeDe(ruta, 'x')).not.toMatch(/restSeconds|exerciseId|items\b/);
    }
  });
});
