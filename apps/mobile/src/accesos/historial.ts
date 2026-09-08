import type { AccessEvent } from '@gymlab/contracts';
import { MENSAJE_DEL_MOTIVO, tonoDeLaDecision } from '../escaner/logica';

/**
 * El historial de la puerta, en pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO SE VUELVE A DECIDIR NADA SOBRE ALLOW / WARN / DENY.                   │
 * │                                                                          │
 * │ El escaner ya tiene `MENSAJE_DEL_MOTIVO` y `tonoDeLaDecision`, validados  │
 * │ en iPhone en STAFF-2. Aqui se REUTILIZAN. Escribir una segunda tabla      │
 * │ significaria que el mismo intento se explica de dos maneras segun se mire │
 * │ en la puerta o en el historial — y ninguna de las dos seria la buena.     │
 * │                                                                          │
 * │ Es lo mismo que hace el panel web: su historial importa                   │
 * │ `MENSAJE_DEL_MOTIVO` del modulo del escaner.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Como se lee una fila del historial. */
export interface LineaDeEvento {
  titulo: string;
  motivo: string;
  tono: ReturnType<typeof tonoDeLaDecision>;
  /** `true` si fue una relectura del mismo carne en la ventana de 3 s. */
  relectura: boolean;
}

export function lineaDeEvento(evento: AccessEvent): LineaDeEvento {
  return {
    /*
     * Sin socio identificado es un caso REAL, no un fallo de datos: un codigo
     * que no correspondia a nadie, o uno caducado que ya no se puede resolver.
     * Decirlo es parte de la respuesta.
     */
    titulo: evento.memberName ?? 'Sin socio identificado',
    motivo: MENSAJE_DEL_MOTIVO[evento.reason],
    tono: tonoDeLaDecision(evento.decision),
    relectura: evento.isRetry,
  };
}

/**
 * Cuantos eventos se piden de una vez.
 *
 * Los mismos 25 que pide el panel. No es un numero al azar: el endpoint admite
 * hasta 100, y traer cien filas para enseñar las de hoy en un telefono no
 * adelanta nada.
 */
export const POR_PAGINA = 25;

/** Si no hay nada que enseñar, y por que puede ser normal. */
export function estaVacio(total: number): boolean {
  return total === 0;
}
