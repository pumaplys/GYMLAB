'use client';

import type { ReactNode } from 'react';
import { Armazon } from '@/componentes/armazon';

/**
 * El marco del area de socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MOVIL PRIMERO, Y POR ESO UNA COLUMNA.                                    │
 * │                                                                          │
 * │ El socio abre esto en la puerta del gimnasio, con una mano, para enseñar │
 * │ su QR o mirar si esta al corriente. No es un escritorio con tablas: es   │
 * │ una columna de cosas.                                                    │
 * │                                                                          │
 * │ De ahi el ancho de LECTURA y no el de trabajo. En un movil da igual —los │
 * │ dos ocupan el ancho de la pantalla— pero en un portatil la diferencia es │
 * │ entre una columna legible y cuatro datos perdidos en 1152 px de blanco.  │
 * │ Que sea movil primero no significa que en escritorio se vea mal.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sin fila de destinos por el mismo motivo que el area de entrenador: hoy hay
 * una sola ruta. El carne, la cuota, la rutina y el progreso llegan en PRs
 * posteriores, y hasta entonces no se anuncian.
 */
export function MarcoSocio({ children }: { children: ReactNode }) {
  return <Armazon ancho="lectura">{children}</Armazon>;
}
