'use client';

import type { ReactNode } from 'react';
import { Armazon } from '@/componentes/armazon';
import { NavegacionDeArea } from '@/componentes/navegacion-de-area';

/**
 * Los destinos del area de entrenador. Los tres existen al terminar este PR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE "EJERCICIOS" ES UN DESTINO Y NO SOLO UN SELECTOR DENTRO DE UNA   │
 * │ RUTINA.                                                                  │
 * │                                                                          │
 * │ Porque asi lo modela el backend: la biblioteca es un recurso DEL         │
 * │ GIMNASIO con CRUD completo abierto a `owner` y `trainer` (ADR-0012). No  │
 * │ es una lista auxiliar del editor: nace copiada de la plantilla de        │
 * │ plataforma y a partir de ahi el gimnasio la hace suya, la edita y la     │
 * │ borra sin restricciones.                                                 │
 * │                                                                          │
 * │ Y responde una pregunta que existe por si sola —"¿que ejercicios tiene   │
 * │ este gimnasio, y con que material?"— que un entrenador se hace ANTES de  │
 * │ sentarse a escribir una rutina, no mientras la escribe.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que NO esta: progreso, consentimiento y asignar rutinas, porque no existen
 * todavia. La regla del proyecto es que la navegacion muestra unicamente
 * destinos reales.
 */
const DESTINOS = [
  { href: '/entrenador', texto: 'Mis socios' },
  { href: '/entrenador/rutinas', texto: 'Rutinas' },
  { href: '/entrenador/ejercicios', texto: 'Ejercicios' },
] as const;

/**
 * El marco del area de entrenador: contexto arriba, destinos debajo.
 *
 * Ancho de TRABAJO: un entrenador consulta listas de socios y tablas de series
 * y repeticiones, igual que recepcion. No es una pantalla de lectura.
 */
export function MarcoEntrenador({ children }: { children: ReactNode }) {
  return <Armazon navegacion={<NavegacionDeArea destinos={DESTINOS} />}>{children}</Armazon>;
}
