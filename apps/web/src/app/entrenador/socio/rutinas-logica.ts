import type { AssignedRoutine, Routine } from '@gymlab/contracts';

/**
 * Las reglas de la seccion de rutinas del socio, sin React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NINGUNA DE ESTAS REGLAS ES INVENTADA AQUI. TODAS SALEN DEL BACKEND.      │
 * │                                                                          │
 * │ Un socio puede seguir VARIAS rutinas a la vez: lo dice el esquema, y es  │
 * │ una decision del modelo. Asignar una segunda NO termina la primera.      │
 * │                                                                          │
 * │ Lo unico prohibido es asignar dos veces la MISMA mientras siga vigente:  │
 * │ hay un indice unico parcial sobre (gym, rutina, socio) WHERE ended_at IS │
 * │ NULL, y el servicio responde 400 antes de llegar a el.                   │
 * │                                                                          │
 * │ La pantalla refleja eso —marca las que ya sigue— pero no lo sustituye:   │
 * │ si el estado local se queda viejo, el 400 sigue siendo la barrera.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Una rutina del gimnasio, con si el socio ya la sigue. */
export interface RutinaElegible {
  rutina: Routine;
  /** Ya vigente para este socio: el servidor rechazaria asignarla otra vez. */
  yaLaSigue: boolean;
}

/**
 * Cruza las rutinas del gimnasio con las que el socio ya sigue.
 *
 * No las quita de la lista: se marcan. Esconderlas dejaria a quien busca
 * "Fuerza principiantes" sin entender por que no aparece.
 */
export function elegibles(
  delGimnasio: readonly Routine[],
  asignadas: readonly AssignedRoutine[],
): RutinaElegible[] {
  const vigentes = new Set(asignadas.map((a) => a.id));
  return delGimnasio.map((rutina) => ({ rutina, yaLaSigue: vigentes.has(rutina.id) }));
}

/** Filtra por nombre y descripcion. Mismo criterio que la biblioteca de ejercicios. */
export function filtrarRutinas(
  candidatas: readonly RutinaElegible[],
  busqueda: string,
): RutinaElegible[] {
  const q = busqueda.trim().toLowerCase();
  if (!q) return [...candidatas];
  return candidatas.filter((c) =>
    `${c.rutina.name} ${c.rutina.description ?? ''}`.toLowerCase().includes(q),
  );
}

/**
 * A partir de cuantas rutinas compensa un buscador.
 *
 * Con tres, un campo de busqueda es ruido: se ven todas de un vistazo. Con
 * treinta, recorrerlas con el pulgar no es razonable. Ocho es donde la lista
 * deja de caber entera en un movil.
 */
export const DESDE_CUANTAS_SE_BUSCA = 8;

/** Cuantos ejercicios tiene una rutina, dicho como se lee. */
export function cuantosEjercicios(rutina: Pick<Routine, 'items'>): string {
  const n = rutina.items.length;
  return n === 1 ? '1 ejercicio' : `${n} ejercicios`;
}
