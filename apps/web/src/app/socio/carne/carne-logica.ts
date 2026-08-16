/**
 * La cuenta atras del QR, sin React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL TOKEN DURA 60 SEGUNDOS Y ES DE UN SOLO USO.                          │
 * │                                                                          │
 * │ Eso lo decide el backend —`TTL_MS = 60_000` y el `jti` se consume al     │
 * │ escanear— y ordena toda la pantalla: no se genera al entrar, porque      │
 * │ estaria caducado antes de llegar al torno. Se genera cuando alguien esta │
 * │ delante de la puerta y pulsa.                                           │
 * │                                                                          │
 * │ La caducidad se calcula contra `expiresAt` del SERVIDOR, no contra un    │
 * │ contador local: si el reloj del movil va adelantado, lo que manda es la  │
 * │ hora a la que el servidor dijo que caduca.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Segundos que le quedan al QR. Nunca negativo: caducado es caducado. */
export function segundosRestantes(expiresAt: string, ahora: number = Date.now()): number {
  const queda = new Date(expiresAt).getTime() - ahora;
  return queda <= 0 ? 0 : Math.ceil(queda / 1000);
}

export function estaCaducado(expiresAt: string, ahora: number = Date.now()): boolean {
  return segundosRestantes(expiresAt, ahora) === 0;
}

/**
 * Lo que se anuncia mientras corre la cuenta atras.
 *
 * Se dice en texto porque el QR no puede ser la unica informacion: quien no ve
 * la pantalla necesita saber si su codigo sigue valiendo, y "45" a secas no lo
 * dice.
 */
export function textoDeCuentaAtras(segundos: number): string {
  if (segundos === 0) return 'El codigo ha caducado. Genera otro.';
  if (segundos === 1) return 'El codigo caduca en 1 segundo.';
  return `El codigo caduca en ${segundos} segundos.`;
}

/**
 * Cada cuanto merece la pena repintar la cuenta atras.
 *
 * Un segundo, no un fotograma: el numero solo cambia una vez por segundo, y
 * refrescar sesenta veces por segundo gastaria bateria del movil de alguien que
 * esta parado en una puerta.
 */
export const CADA_CUANTO_MS = 1000;
