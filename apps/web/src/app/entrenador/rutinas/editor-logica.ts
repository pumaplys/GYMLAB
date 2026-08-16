import type { CreateRoutineInput, Routine } from '@gymlab/contracts';

/**
 * La logica del editor de rutinas, sin React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTA APARTE PORQUE ES LO QUE PUEDE DESTRUIR DATOS.                       │
 * │                                                                          │
 * │ El servidor BORRA los items de la rutina y los reinserta desde lo que le │
 * │ llega. Eso convierte dos errores callados en catastroficos: omitir un    │
 * │ item lo borra, y mandar mal el orden cambia la rutina — y las dos cosas  │
 * │ responden 200.                                                           │
 * │                                                                          │
 * │ Sacarlo del componente permite comprobarlo sin navegador y sin montar un │
 * │ DOM: lo fragil no es como se pinta una fila, es que se envie entera y en │
 * │ su sitio.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface ItemEditable {
  /**
   * Identidad de la FILA, no del ejercicio.
   *
   * Dos items pueden apuntar al mismo ejercicio —el contrato no lo prohibe, y
   * es legitimo: press de banca al principio y al final— asi que `exerciseId`
   * no sirve como clave de React. Con ella, editar la segunda fila cambiaria
   * tambien la primera.
   */
  clave: string;
  /** Nulo si el gimnasio borro ese ejercicio de su biblioteca. */
  exerciseId: string | null;
  exerciseName: string;
  /** Todos como texto: son lo que hay escrito en un `<input>`, no numeros aun. */
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
 * Sube o baja un item intercambiandolo con su vecino.
 *
 * Devuelve la lista intacta si el movimiento se sale: el primero no sube y el
 * ultimo no baja. Los botones ya salen deshabilitados en esos casos, pero la
 * funcion no da eso por hecho.
 */
export function mover(items: readonly ItemEditable[], indice: number, direccion: -1 | 1) {
  const destino = indice + direccion;
  if (destino < 0 || destino >= items.length) return [...items];
  const copia = [...items];
  [copia[indice], copia[destino]] = [copia[destino]!, copia[indice]!];
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
  if (ruta[0] === 'items' && ruta.length === 1) return 'anade al menos un ejercicio';
  if (ruta[0] === 'items' && typeof ruta[1] === 'number') {
    const cual = `ejercicio ${ruta[1] + 1}`;
    if (ruta[2] === 'exerciseId') return `${cual}: ya no esta en la biblioteca, elige otro o quitalo`;
    if (ruta[2] === 'sets') return `${cual}: las series van de 1 a 20`;
    if (ruta[2] === 'reps') return `${cual}: escribe las repeticiones`;
    if (ruta[2] === 'restSeconds') return `${cual}: el descanso va de 0 a 600 segundos`;
    return `${cual}: ${mensaje.toLowerCase()}`;
  }
  return mensaje;
}
