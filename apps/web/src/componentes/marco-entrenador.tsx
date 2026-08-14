'use client';

import type { ReactNode } from 'react';
import { Armazon } from '@/componentes/armazon';

/**
 * El marco del area de entrenador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN FILA DE DESTINOS, Y NO ES UN OLVIDO.                                 │
 * │                                                                          │
 * │ Este bloque construye los cimientos; las pantallas de entrenador —sus    │
 * │ socios, rutinas, ejercicios, progreso— llegan en PRs posteriores. Hoy    │
 * │ existe UNA ruta, `/entrenador`, y una barra de navegacion con un solo    │
 * │ elemento que apunta a donde ya estas no informa de nada.                 │
 * │                                                                          │
 * │ Y sobre todo: poner ahi "Mis socios" o "Rutinas" antes de que existan    │
 * │ seria un enlace muerto. La regla del proyecto es que la navegacion       │
 * │ muestra unicamente destinos reales, y se cumple tambien cuando el numero │
 * │ de destinos reales es uno.                                               │
 * │                                                                          │
 * │ El hueco esta preparado: `Armazon` acepta `navegacion` y el dia que haya │
 * │ dos pantallas se rellena aqui, sin tocar el panel ni el area de socio.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ancho de TRABAJO: un entrenador consulta listas de socios y tablas de series
 * y repeticiones, igual que recepcion. No es una pantalla de lectura.
 */
export function MarcoEntrenador({ children }: { children: ReactNode }) {
  return <Armazon>{children}</Armazon>;
}
