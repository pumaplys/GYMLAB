'use client';

import type { ReactNode } from 'react';
import { Armazon } from '@/componentes/armazon';
import { NavegacionDeArea } from '@/componentes/navegacion-de-area';

/**
 * Los destinos del socio. Los cuatro existen.
 *
 * No estan su carne con QR, sus pagos ni sus accesos: la regla del proyecto es
 * que la navegacion solo muestra destinos reales, y un enlace a una pantalla que
 * no existe es peor que no tener el enlace. Ademas dos de ellos necesitan
 * endpoints `me/*` que todavia no existen.
 *
 * "Privacidad" y no "Consentimiento": es la palabra que usa quien lo busca.
 * "Rutina" en singular aunque puedan ser varias: es como se dice.
 */
const DESTINOS = [
  { href: '/socio', texto: 'Inicio' },
  { href: '/socio/rutina', texto: 'Rutina' },
  { href: '/socio/progreso', texto: 'Progreso' },
  { href: '/socio/carne', texto: 'Carne' },
  { href: '/socio/privacidad', texto: 'Privacidad' },
] as const;

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
 * Ya con fila de destinos: hay dos pantallas reales. El carne, la rutina y el
 * progreso llegan en PRs posteriores y hasta entonces no se anuncian.
 */
export function MarcoSocio({ children }: { children: ReactNode }) {
  return (
    <Armazon ancho="lectura" navegacion={<NavegacionDeArea destinos={DESTINOS} />}>
      {children}
    </Armazon>
  );
}
