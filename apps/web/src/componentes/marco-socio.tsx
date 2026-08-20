'use client';

import type { ReactNode } from 'react';
import { Shell } from '@/componentes/shell';
import {
  DESTINOS_SOCIO,
  DESTINOS_SOCIO_SECUNDARIOS,
  DESTINOS_SOCIO_TODOS,
} from '@/lib/navegacion';

/**
 * El marco del area de socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI SI BARRA INFERIOR, Y POR UNA RAZON DE USO.                          │
 * │                                                                          │
 * │ El socio abre esto DE PIE, en la puerta del gimnasio, con una mano y a   │
 * │ menudo con prisa. Lo que necesita esta en la mitad de abajo de la        │
 * │ pantalla, que es donde llega el pulgar; un cajon exigiria dos toques     │
 * │ para todo y el primero arriba del todo.                                  │
 * │                                                                          │
 * │ En ancho la barra desaparece: una barra inferior en un monitor de 27     │
 * │ pulgadas es un patron de telefono estirado. Ahi manda la lateral, con    │
 * │ los SIETE destinos, que es donde si caben.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function MarcoSocio({ children }: { children: ReactNode }) {
  return (
    <Shell
      destinos={DESTINOS_SOCIO_TODOS}
      barraPrincipales={DESTINOS_SOCIO}
      barraSecundarios={DESTINOS_SOCIO_SECUNDARIOS}
      modoMovil="barra"
      ancho="lectura"
    >
      {children}
    </Shell>
  );
}
