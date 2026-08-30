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
      /*
       * ANCHO DE TRABAJO, NO DE LECTURA.
       *
       * Estaba en "lectura" —704 px en TODOS los anchos— con este argumento:
       * aqui no hay tablas, solo una cuota, una rutina y un carne, y estirarlos
       * a 1.152 px daria mas distancia entre etiqueta y valor, no mas
       * informacion.
       *
       * Es cierto para UNA columna de pares dato/valor, y deja de serlo en
       * cuanto las cosas pueden ponerse una al lado de otra. Medido a 1.440:
       * el contenido ocupaba 640 px de los 1.216 disponibles —el 53%— con la
       * cuota, los datos y la salud apilados en fila india y medio lienzo en
       * blanco al lado.
       *
       * El shell deja de imponer el ancho, como ya hizo con el panel en D3, y
       * cada pantalla decide: el carne y privacidad se lo vuelven a poner
       * porque si son de leer; inicio, rutina, pagos y accesos lo aprovechan.
       */
      ancho="trabajo"
    >
      {children}
    </Shell>
  );
}
