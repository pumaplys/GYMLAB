'use client';

import { useMemo } from 'react';
import type { Exercise } from '@gymlab/contracts';
import { SelectorEnLinea } from '@/componentes/selector-en-linea';
import { NOMBRE_DEL_GRUPO } from '@/lib/ejercicios';

/**
 * Elegir un ejercicio de la biblioteca del gimnasio.
 *
 * La mecanica —buscar, listar, elegir en linea— la pone `SelectorEnLinea`, que
 * comparte con el selector de rutinas. Aqui solo se decide que se ve de cada
 * ejercicio: el nombre, y debajo grupo y material, que es por donde se busca.
 *
 * Solo recibe ejercicios que ya vienen del gimnasio activo: no hay forma de que
 * aparezca uno ajeno, porque esta lista la trae `GET /gyms/:gymId/exercises` y
 * el servidor la acota. Aqui no se filtra por gimnasio — se filtra por texto.
 */
export function SelectorDeEjercicio({
  ejercicios,
  etiqueta,
  onElegir,
  onCancelar,
}: {
  ejercicios: readonly Exercise[];
  /** Que se esta eligiendo: anadir uno nuevo, o sustituir el que falta. */
  etiqueta: string;
  onElegir: (ejercicio: Exercise) => void;
  onCancelar: () => void;
}) {
  const opciones = useMemo(
    () =>
      ejercicios.map((e) => ({
        clave: e.id,
        titulo: e.name,
        detalle: `${NOMBRE_DEL_GRUPO[e.muscleGroup]}${e.equipment ? ` · ${e.equipment}` : ''}`,
      })),
    [ejercicios],
  );

  return (
    <SelectorEnLinea
      opciones={opciones}
      etiqueta={etiqueta}
      placeholder="Buscar por nombre, material o grupo"
      tituloVacio="La biblioteca esta vacia"
      textoVacio="Este gimnasio ha borrado todos los ejercicios de su biblioteca."
      onElegir={(clave) => {
        const elegido = ejercicios.find((e) => e.id === clave);
        if (elegido) onElegir(elegido);
      }}
      onCancelar={onCancelar}
    />
  );
}
