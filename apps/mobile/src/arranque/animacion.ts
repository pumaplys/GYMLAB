/**
 * Los numeros de la animacion de arranque, sin React y sin `Animated`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ANIMACION ES PRESENTACION. NO DECIDE CUANTO DURA EL ARRANQUE.        │
 * │                                                                          │
 * │ No hay `setTimeout` que retrase nada, ni minimo de "que se vea el logo": │
 * │ en cuanto la sesion esta resuelta, la puerta cambia de pantalla, aunque  │
 * │ sea a los 200 ms y la respiracion no haya dado ni un ciclo. Si tarda dos │
 * │ segundos, la animacion acompaña esos dos segundos.                       │
 * │                                                                          │
 * │ Por eso aqui solo hay duraciones y escalas: nada que se pueda esperar.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** La entrada: aparece y se asienta. Una sola vez. */
export const ENTRADA = {
  /** Milisegundos. Lo justo para que no sea un corte seco. */
  duracion: 420,
  escalaInicial: 0.96,
  escalaFinal: 1,
  opacidadInicial: 0,
  opacidadFinal: 1,
} as const;

/**
 * La respiracion: un 2 % arriba y otro abajo, muy despacio.
 *
 * 2600 ms por medio ciclo son 5,2 s de ida y vuelta. Es lento a proposito: por
 * debajo de dos segundos deja de leerse como respiracion y empieza a parecer
 * un latido, que es justo la estetica que no queremos.
 */
export const RESPIRACION = {
  duracion: 2600,
  escalaMinima: 1,
  escalaMaxima: 1.02,
} as const;

/**
 * Que animacion corresponde, segun si el sistema pide reducir el movimiento.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CON MOVIMIENTO REDUCIDO NO SE QUITA TODO: SE QUITA LO QUE SE MUEVE.     │
 * │                                                                          │
 * │ Quien activa ese ajuste suele hacerlo por mareo o por sensibilidad       │
 * │ vestibular. Lo que marea es el ESCALADO —algo que crece y encoge sin     │
 * │ parar—, no que una imagen aparezca. Asi que la respiracion desaparece    │
 * │ del todo y la entrada se queda en un fundido, sin zoom.                  │
 * │                                                                          │
 * │ Es logica pura y por eso se puede probar sin montar nada.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface PlanDeAnimacion {
  /** Si la entrada incluye escalado, ademas del fundido. */
  escalaEnEntrada: boolean;
  /** Si el logo respira mientras se espera. */
  respira: boolean;
  duracionDeEntrada: number;
  escalaInicial: number;
}

export function planDeAnimacion(movimientoReducido: boolean): PlanDeAnimacion {
  if (movimientoReducido) {
    return {
      escalaEnEntrada: false,
      respira: false,
      duracionDeEntrada: ENTRADA.duracion,
      // Sin zoom: entra a su tamaño y solo cambia la opacidad.
      escalaInicial: ENTRADA.escalaFinal,
    };
  }
  return {
    escalaEnEntrada: true,
    respira: true,
    duracionDeEntrada: ENTRADA.duracion,
    escalaInicial: ENTRADA.escalaInicial,
  };
}
