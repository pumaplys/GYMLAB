import type { DuesState } from '@gymlab/contracts';

/**
 * Qué se puede hacer con una cuota según cómo esté.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO INVENTA REGLAS: COPIA LAS DEL SERVIDOR.                         │
 * │                                                                          │
 * │ `pause` falla si ya está congelada o si el periodo venció —«no se puede  │
 * │ congelar una cuota vencida: no quedan días que guardar»—, `resume` falla │
 * │ si no lo estaba, y `cancel` exige una cuota vigente. Esas comprobaciones │
 * │ están en `BillingService` y son las que mandan.                          │
 * │                                                                          │
 * │ Aquí solo se decide qué BOTONES tiene sentido ofrecer, para que nadie    │
 * │ pulse algo que el servidor va a rechazar. Si alguna vez discrepan, gana  │
 * │ el servidor y el mensaje se muestra: por eso la pantalla también pinta   │
 * │ el error en lugar de confiar en que esto esté siempre al día.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `Record<DuesState, …>` obliga a pasar por aquí si algún día se añade un
 * estado: sin eso, el estado nuevo heredaría en silencio las acciones del
 * `default` y podría ofrecer congelar una cuota que no se puede congelar.
 */
export interface AccionesDeCuota {
  congelar: boolean;
  reanudar: boolean;
  darDeBaja: boolean;
}

const NINGUNA: AccionesDeCuota = { congelar: false, reanudar: false, darDeBaja: false };

export const ACCIONES_POR_ESTADO: Record<DuesState, AccionesDeCuota> = {
  // Dentro de periodo: se puede congelar y se puede dar de baja.
  AL_CORRIENTE: { congelar: true, reanudar: false, darDeBaja: true },
  POR_VENCER: { congelar: true, reanudar: false, darDeBaja: true },

  /*
   * Vencida —con cortesía o sin ella—: NO se ofrece congelar. El servidor lo
   * rechaza porque no quedan días que guardar, y ofrecer un botón que siempre
   * falla es peor que no tenerlo.
   */
  EN_GRACIA: { congelar: false, reanudar: false, darDeBaja: true },
  VENCIDA: { congelar: false, reanudar: false, darDeBaja: true },

  // Congelada: solo se reanuda o se da de baja.
  PAUSADA: { congelar: false, reanudar: true, darDeBaja: true },

  // Sin cuota no hay nada que congelar ni que dar de baja.
  SIN_SUSCRIPCION: NINGUNA,
};

export function accionesDeCuota(estado: DuesState): AccionesDeCuota {
  return ACCIONES_POR_ESTADO[estado];
}

/**
 * Si una cuota ya no admite ninguna acción de ciclo de vida.
 *
 * Sirve para no pintar una fila de botones vacía, que parece un fallo de carga.
 */
export function sinAcciones(estado: DuesState): boolean {
  const acciones = accionesDeCuota(estado);
  return !acciones.congelar && !acciones.reanudar && !acciones.darDeBaja;
}
