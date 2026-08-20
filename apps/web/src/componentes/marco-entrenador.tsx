'use client';

import type { ReactNode } from 'react';
import { Shell } from '@/componentes/shell';
import { DESTINOS_ENTRENADOR } from '@/lib/navegacion';

/**
 * El marco del area de entrenador.
 *
 * Tres destinos, asi que en movil cabrian en una tira — pero lleva el mismo
 * cajon que el panel a proposito: quien atiende un mostrador y quien esta en
 * sala son a menudo la misma persona en el mismo turno, y dos gramaticas de
 * navegacion distintas para el mismo dedo es lo que hace que haya que pensar
 * antes de pulsar.
 */
export function MarcoEntrenador({ children }: { children: ReactNode }) {
  return (
    <Shell destinos={DESTINOS_ENTRENADOR} modoMovil="cajon">
      {children}
    </Shell>
  );
}
