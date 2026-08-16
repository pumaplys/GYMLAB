'use client';

import { useMemo, useState } from 'react';
import type { Exercise } from '@gymlab/contracts';
import { Boton } from '@/componentes/boton';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { NOMBRE_DEL_GRUPO, filtrarEjercicios } from '@/lib/ejercicios';
import estilos from './selector-de-ejercicio.module.css';

/**
 * Elegir un ejercicio de la biblioteca, sin salir de la pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI UN `<select>` DE 75 OPCIONES NI UN MODAL.                             │
 * │                                                                          │
 * │ El desplegable nativo es comodo con ocho opciones y desesperante con     │
 * │ setenta y cinco: en un movil se convierte en una rueda que hay que       │
 * │ recorrer a ciegas, sin buscar por material ni por grupo.                 │
 * │                                                                          │
 * │ Y un modal esta descartado en todo el proyecto: en un gimnasio, un       │
 * │ dialogo que roba el foco y tapa la pantalla obliga a recolocarse. Lo     │
 * │ mismo que ya se decidio para las confirmaciones.                         │
 * │                                                                          │
 * │ Asi que la busqueda se abre EN LINEA, donde estaba el boton, empujando   │
 * │ el resto hacia abajo. No tapa nada y se cierra donde se abrio.           │
 * └──────────────────────────────────────────────────────────────────────────┘
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
  const [busqueda, setBusqueda] = useState('');
  const idBusqueda = 'buscar-ejercicio-selector';

  const visibles = useMemo(() => filtrarEjercicios(ejercicios, busqueda), [ejercicios, busqueda]);

  return (
    <div className={estilos.selector}>
      <div className={estilos.cabecera}>
        <label className={estilos.etiqueta} htmlFor={idBusqueda}>
          {etiqueta}
        </label>
        <Boton variante="sutil" tamano="sm" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>

      <input
        id={idBusqueda}
        type="search"
        className={estilos.buscador}
        placeholder="Buscar por nombre, material o grupo"
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        // Es lo unico que se acaba de abrir y para lo que se abrio: escribir.
        autoFocus
      />

      {visibles.length === 0 ? (
        <EstadoVacio
          titulo={
            ejercicios.length === 0 ? 'La biblioteca esta vacia' : 'Ningun ejercicio coincide'
          }
          texto={
            ejercicios.length === 0
              ? 'Este gimnasio ha borrado todos los ejercicios de su biblioteca.'
              : 'Prueba con otro nombre, con el material o con el grupo muscular.'
          }
        />
      ) : (
        /*
         * Una lista de botones y no de enlaces: elegir un ejercicio no navega a
         * ningun sitio, cambia el formulario que hay debajo.
         */
        <ul className={estilos.resultados} aria-label="Resultados">
          {visibles.map((ejercicio) => (
            <li key={ejercicio.id}>
              <button
                type="button"
                className={estilos.resultado}
                onClick={() => onElegir(ejercicio)}
              >
                <span className={estilos.nombre}>{ejercicio.name}</span>
                <span className={estilos.detalle}>
                  {NOMBRE_DEL_GRUPO[ejercicio.muscleGroup]}
                  {ejercicio.equipment ? ` · ${ejercicio.equipment}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
