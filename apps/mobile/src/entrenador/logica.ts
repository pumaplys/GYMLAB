import type { AssignedMember, AssignedRoutine, BodyMetric } from '@gymlab/contracts';

/**
 * Las decisiones del area del entrenador, sin React y sin red.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO LECTURA, Y NO ES UNA LIMITACION TECNICA.                           │
 * │                                                                          │
 * │ Programar una rutina es un trabajo de escritorio: se comparan ejercicios,│
 * │ se ajustan series, se arrastra. Nada de eso mejora en una pantalla de    │
 * │ 390 px de ancho, y el panel web ya lo tiene resuelto.                    │
 * │                                                                          │
 * │ Lo que SI mejora en el telefono es consultar de pie, en la sala, con el  │
 * │ socio delante: que rutina lleva, cuanto pesaba la ultima vez. Eso es lo  │
 * │ que hay aqui y por eso no hay ni un camino de escritura.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** El estado de una peticion. Mismo vocabulario que el resto de la app. */
export type EstadoDeCarga<T> =
  | { fase: 'cargando' }
  | { fase: 'ok'; datos: T }
  | { fase: 'fallo'; mensaje: string };

/** El nombre completo, tal cual lo devuelve el contrato. */
export function nombreDelAsignado(socio: AssignedMember): string {
  return `${socio.firstName} ${socio.lastName}`.trim();
}

/**
 * Como se resume un socio asignado en una fila.
 *
 * El numero de socio va siempre: es lo que desempata cuando dos personas se
 * llaman igual, que en un gimnasio pasa.
 */
export function lineaDeAsignado(socio: AssignedMember): { titulo: string; detalle: string } {
  const partes = [`nº ${socio.memberNumber}`];
  if (socio.status !== 'active') partes.push('de baja');
  return { titulo: nombreDelAsignado(socio), detalle: partes.join(' · ') };
}

/**
 * Los socios, ordenados por apellido y luego por nombre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL SERVIDOR NO PROMETE ORDEN, Y UNA LISTA QUE BAILA ES INSERVIBLE.      │
 * │                                                                          │
 * │ `/me/trainer/members` devuelve un array sin `order by` declarado en el   │
 * │ contrato. Si el orden cambiara entre dos cargas, quien busca a alguien   │
 * │ con el pulgar tendria que releer la lista entera cada vez.               │
 * │                                                                          │
 * │ `localeCompare` con 'es' para que la Ñ caiga donde tiene que caer y los  │
 * │ acentos no manden a «Álvarez» al final.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ordenados(socios: readonly AssignedMember[]): readonly AssignedMember[] {
  return [...socios].sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName, 'es') || a.firstName.localeCompare(b.firstName, 'es'),
  );
}

/** Cuantos socios tiene asignados, dicho como se dice. */
export function recuentoDeSocios(cuantos: number): string {
  return cuantos === 1 ? '1 socio asignado' : `${cuantos} socios asignados`;
}

/**
 * Como se resume una rutina asignada.
 *
 * Solo el nombre y desde cuando: los ejercicios son otra peticion y otra
 * pantalla, y esta responde «¿qué está siguiendo?», no «¿qué toca hoy?».
 */
export function lineaDeRutina(
  rutina: AssignedRoutine,
  formatearFecha: (iso: string) => string,
): { titulo: string; detalle: string } {
  const ejercicios =
    rutina.items.length === 1 ? '1 ejercicio' : `${rutina.items.length} ejercicios`;
  return {
    titulo: rutina.name,
    detalle: `${ejercicios} · desde el ${formatearFecha(rutina.assignedAt)}`,
  };
}

/**
 * La ultima medicion, si la hay.
 *
 * El historial viene ordenado de mas nueva a mas vieja desde el servidor
 * (`order by measured_at desc`), asi que la primera es la ultima tomada. Aun
 * asi NO se da por hecho: se busca el maximo, porque depender del orden de otra
 * capa es depender de algo que nadie prometio.
 */
export function ultimaMedicion(historial: readonly BodyMetric[]): BodyMetric | null {
  if (historial.length === 0) return null;
  return historial.reduce((mejor, actual) =>
    actual.measuredAt > mejor.measuredAt ? actual : mejor,
  );
}

export interface ValorDeMedicion {
  etiqueta: string;
  valor: string;
}

/**
 * Los valores que TRAE esa medicion. Los que no, no se inventan.
 *
 * Todas las medidas son opcionales en el contrato: se apunta lo que se midio.
 * Pintar «Cintura: —» en una medicion de solo peso llenaria la pantalla de
 * huecos que no dicen nada.
 */
export function valoresDeMedicion(medicion: BodyMetric): readonly ValorDeMedicion[] {
  const campos: Array<[keyof BodyMetric, string, string]> = [
    ['weightKg', 'Peso', 'kg'],
    ['bodyFatPercent', 'Grasa', '%'],
    ['chestCm', 'Pecho', 'cm'],
    ['waistCm', 'Cintura', 'cm'],
    ['hipCm', 'Cadera', 'cm'],
    ['armCm', 'Brazo', 'cm'],
    ['thighCm', 'Muslo', 'cm'],
  ];
  const salida: ValorDeMedicion[] = [];
  for (const [campo, etiqueta, unidad] of campos) {
    const valor = medicion[campo];
    if (typeof valor === 'number') salida.push({ etiqueta, valor: `${valor} ${unidad}` });
  }
  return salida;
}
