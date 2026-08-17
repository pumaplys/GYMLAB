import type { OwnAccessEvent, OwnPayment } from '@gymlab/contracts';

/**
 * Como se leen los historiales del socio, sin React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE DECIDE NADA: SE TRADUCE.                                     │
 * │                                                                          │
 * │ Los conceptos, los metodos de pago y los motivos de acceso son enums del │
 * │ contrato. Lo unico que pasa aqui es ponerlos en castellano — y hacerlo   │
 * │ con `Record<...>` completo, para que anadir un valor nuevo al contrato   │
 * │ deje de compilar en lugar de pintar `DUES_WARN` en la pantalla de una    │
 * │ persona.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** El concepto de un pago, tal y como lo entiende quien lo hizo. */
export const CONCEPTO: Record<OwnPayment['concept'], string> = {
  subscription: 'Cuota',
  enrolment: 'Matricula',
  other: 'Otro',
};

export const METODO: Record<OwnPayment['method'], string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

/**
 * Fecha con hora, para el historial de entradas.
 *
 * `comoFecha` da solo el dia, y aqui la hora es el dato: alguien que mira si
 * entro esta manana necesita distinguirlo de la tarde.
 */
export function comoFechaYHora(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Como se le cuenta al socio cada motivo de acceso.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `TOKEN_REUSED` SE DICE SIN DRAMATIZAR.                                  │
 * │                                                                          │
 * │ Significa que su codigo se presento desde un segundo escaner. Puede ser  │
 * │ que lo compartiera, o que alguien le hiciera una foto a la pantalla — o  │
 * │ simplemente dos tornos a la vez. Acusar a nadie desde aqui seria         │
 * │ irresponsable: se dice lo que paso y ya.                                 │
 * │                                                                          │
 * │ `BAD_SIGNATURE`, `TOKEN_EXPIRED` y `UNKNOWN_MEMBER` estan en el tipo     │
 * │ porque el enum los tiene, pero NO PUEDEN LLEGAR AQUI: esos eventos se    │
 * │ registran sin socio. Se les da texto igualmente en vez de dejar un       │
 * │ hueco, porque un `Record` incompleto no compila y un texto sin usar es   │
 * │ mas barato que una pantalla en blanco si algo cambia.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const MOTIVO_DE_ACCESO: Record<OwnAccessEvent['reason'], string> = {
  OK: 'Entrada correcta',
  DUES_WARN: 'Entraste, con la cuota a punto de vencer',
  DUES_EXPIRED: 'No pudiste entrar: la cuota estaba vencida',
  NO_SUBSCRIPTION: 'No pudiste entrar: no tenias cuota contratada',
  MEMBER_INACTIVE: 'No pudiste entrar: tu ficha estaba de baja',
  TOKEN_REUSED: 'Ese codigo ya se habia usado en otro punto de entrada',
  TOKEN_EXPIRED: 'El codigo habia caducado',
  BAD_SIGNATURE: 'El codigo no era valido',
  UNKNOWN_MEMBER: 'No se pudo identificar el codigo',
};

/**
 * Si merece destacarse por seguridad.
 *
 * Solo `TOKEN_REUSED`: es lo unico que le dice al socio algo sobre SU codigo
 * que no sabia. Una cuota vencida ya la conoce por otras vias.
 */
export function esAvisoDeSeguridad(evento: OwnAccessEvent): boolean {
  return evento.reason === 'TOKEN_REUSED';
}

/** Cuantas paginas hay. Al menos una, aunque este vacia. */
export function totalDePaginas(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
