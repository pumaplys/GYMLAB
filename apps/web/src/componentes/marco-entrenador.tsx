'use client';

import type { ReactNode } from 'react';
import { Marco } from '@/componentes/marco';
import { Shell } from '@/componentes/shell';
import { DESTINOS_ENTRENADOR } from '@/lib/navegacion';
import { useSesion } from '@/lib/sesion';

/**
 * El marco del area de entrenador.
 *
 * Tres destinos, asi que en movil cabrian en una tira — pero lleva el mismo
 * cajon que el panel a proposito: quien atiende un mostrador y quien esta en
 * sala son a menudo la misma persona en el mismo turno, y dos gramaticas de
 * navegacion distintas para el mismo dedo es lo que hace que haya que pensar
 * antes de pulsar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AL DUEÑO SE LE PINTA SU PROPIA NAVEGACION, NO LA DEL ENTRENADOR.        │
 * │                                                                          │
 * │ Desde PARITY-5 el dueño entra en Rutinas y Ejercicios, que la API le     │
 * │ autoriza. Si aqui se le enseñara `DESTINOS_ENTRENADOR`, veria «Mis       │
 * │ socios» — que es del entrenador y solo suya, `@Roles('trainer')`— y al   │
 * │ pulsarla se le devolveria al Panel. Un enlace que rebota es peor que no  │
 * │ tenerlo.                                                                 │
 * │                                                                          │
 * │ Asi que se reutiliza `Marco`: el dueño se mueve por el Panel, donde ya   │
 * │ tiene sus dos entradas de entrenamiento.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function MarcoEntrenador({ children }: { children: ReactNode }) {
  const { rol } = useSesion();
  if (rol === 'owner') return <Marco>{children}</Marco>;

  return (
    <Shell destinos={DESTINOS_ENTRENADOR} modoMovil="cajon">
      {children}
    </Shell>
  );
}
