import type { CreateRoutineInput, Routine } from '@gymlab/contracts';

/**
 * El editor de rutinas, sin React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTA APARTE PORQUE ES LO QUE PUEDE DESTRUIR DATOS.                       │
 * │                                                                          │
 * │ Al guardar, el servidor BORRA los items de la rutina y los reinserta     │
 * │ desde lo que le llega. Eso convierte dos errores callados en             │
 * │ catastroficos: omitir un item lo borra, y mandar mal el orden cambia la  │
 * │ rutina — y las dos cosas responden 200.                                  │
 * │                                                                          │
 * │ ES LA MISMA LOGICA QUE EL EDITOR DEL PANEL WEB, y no por comodidad: si   │
 * │ las dos pantallas construyeran el envio de forma distinta, la misma      │
 * │ rutina se guardaria distinta segun donde se editara. Un test compara las │
 * │ dos implementaciones sobre las mismas entradas.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface ItemEditable {
  /**
   * Identidad de la FILA, no del ejercicio.
   *
   * Dos items pueden apuntar al mismo ejercicio —el contrato no lo prohibe, y
   * es legitimo: press de banca al principio y al final— asi que `exerciseId`
   * no sirve como clave de lista. Con ella, editar la segunda fila cambiaria
   * tambien la primera.
   */
  clave: string;
  /** Nulo si el gimnasio borro ese ejercicio de su biblioteca. */
  exerciseId: string | null;
  exerciseName: string;
  /** Todos como texto: es lo que hay escrito en un campo, no numeros aun. */
  sets: string;
  reps: string;
  restSeconds: string;
  notes: string;
}

/** Carga una rutina del servidor al estado editable. */
export function itemsDesde(rutina: Routine): ItemEditable[] {
  return rutina.items.map((item, indice) => ({
    clave: `${item.id}-${indice}`,
    exerciseId: item.exerciseId,
    exerciseName: item.exerciseName,
    sets: String(item.sets),
    reps: item.reps,
    restSeconds: item.restSeconds === null ? '' : String(item.restSeconds),
    notes: item.notes ?? '',
  }));
}

/**
 * Anade un ejercicio al final.
 *
 * Los valores de partida son los de una serie corriente, no vacios: obligar a
 * escribir «3» y «10» en cada fila de una rutina de ocho ejercicios convierte
 * el editor en un formulario, y ademas deja la rutina invalida si a alguien se
 * le pasa una. Se pueden cambiar, que para eso son campos.
 */
export function anadir(
  items: readonly ItemEditable[],
  ejercicio: { id: string; name: string },
  clave: string,
): ItemEditable[] {
  return [
    ...items,
    {
      clave,
      exerciseId: ejercicio.id,
      exerciseName: ejercicio.name,
      sets: '3',
      reps: '10',
      restSeconds: '',
      notes: '',
    },
  ];
}

/**
 * Cambia el EJERCICIO de una fila conservando todo lo demas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES PARA EL EJERCICIO QUE YA NO ESTA EN LA BIBLIOTECA.                    │
 * │                                                                          │
 * │ Cuando alguien borra un ejercicio, las rutinas que lo usaban conservan    │
 * │ su nombre pero pierden la referencia, y esa rutina ya no se puede         │
 * │ guardar: el esquema exige un `exerciseId` valido. La salida NO puede ser  │
 * │ solo «quitalo», porque las series, las repeticiones, el descanso y las    │
 * │ notas las escribio alguien y siguen siendo buenas.                        │
 * │                                                                          │
 * │ Asi que se sustituye: cambia a que ejercicio apunta la fila y se queda    │
 * │ TODO lo demas. Es exactamente lo que hace el «Elegir sustituto» del       │
 * │ panel web, y por eso no se recorta aqui.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function sustituir(
  items: readonly ItemEditable[],
  clave: string,
  ejercicio: { id: string; name: string },
): ItemEditable[] {
  return items.map((i) =>
    i.clave === clave ? { ...i, exerciseId: ejercicio.id, exerciseName: ejercicio.name } : i,
  );
}

/** Quita una fila. Por clave y no por indice: la lista se reordena. */
export function quitar(items: readonly ItemEditable[], clave: string): ItemEditable[] {
  return items.filter((i) => i.clave !== clave);
}

/** Cambia UN campo de UNA fila, sin tocar las demas. */
export function cambiar(
  items: readonly ItemEditable[],
  clave: string,
  campo: 'sets' | 'reps' | 'restSeconds' | 'notes',
  valor: string,
): ItemEditable[] {
  return items.map((i) => (i.clave === clave ? { ...i, [campo]: valor } : i));
}

/**
 * Sube o baja un item intercambiandolo con su vecino.
 *
 * Devuelve la lista intacta si el movimiento se sale: el primero no sube y el
 * ultimo no baja. Los botones ya salen deshabilitados en esos casos, pero la
 * funcion no da eso por hecho.
 */
export function mover(
  items: readonly ItemEditable[],
  indice: number,
  direccion: -1 | 1,
): ItemEditable[] {
  const destino = indice + direccion;
  if (destino < 0 || destino >= items.length) return [...items];
  const copia = [...items];
  const a = copia[indice];
  const b = copia[destino];
  if (a === undefined || b === undefined) return [...items];
  copia[indice] = b;
  copia[destino] = a;
  return copia;
}

/**
 * Construye lo que se manda al servidor.
 *
 * NO FILTRA NADA. Un item cuyo ejercicio ya no existe se incluye igual, con
 * `exerciseId` vacio, para que la validacion lo rechace senalandolo. Si se
 * filtrara aqui, el esquema pasaria y el guardado lo borraria en silencio —
 * que es exactamente lo que no puede ocurrir.
 */
export function aEnvio(
  nombre: string,
  descripcion: string,
  items: readonly ItemEditable[],
): CreateRoutineInput {
  return {
    name: nombre.trim(),
    ...(descripcion.trim() ? { description: descripcion.trim() } : {}),
    items: items.map((i) => ({
      exerciseId: i.exerciseId ?? '',
      sets: Number(i.sets),
      reps: i.reps.trim(),
      ...(i.restSeconds.trim() ? { restSeconds: Number(i.restSeconds) } : {}),
      ...(i.notes.trim() ? { notes: i.notes.trim() } : {}),
    })),
  } as CreateRoutineInput;
}

/** Traduce la ruta del esquema a algo que se pueda leer en pantalla. */
export function mensajeDe(ruta: readonly PropertyKey[], mensaje: string): string {
  if (ruta[0] === 'name') return 'la rutina necesita un nombre';
  if (ruta[0] === 'items' && ruta.length === 1) return 'añade al menos un ejercicio';
  if (ruta[0] === 'items' && typeof ruta[1] === 'number') {
    const cual = `ejercicio ${ruta[1] + 1}`;
    if (ruta[2] === 'exerciseId')
      return `${cual}: ya no está en la biblioteca, elige otro o quítalo`;
    if (ruta[2] === 'sets') return `${cual}: las series van de 1 a 20`;
    if (ruta[2] === 'reps') return `${cual}: escribe las repeticiones`;
    if (ruta[2] === 'restSeconds') return `${cual}: el descanso va de 0 a 600 segundos`;
    return `${cual}: ${mensaje.toLowerCase()}`;
  }
  return mensaje;
}
