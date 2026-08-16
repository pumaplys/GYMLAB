'use client';

import { useMemo, useState } from 'react';
import { Boton } from '@/componentes/boton';
import { EstadoVacio } from '@/componentes/estado-vacio';
import estilos from './selector-en-linea.module.css';

/**
 * Elegir una cosa de una lista, sin salir de la pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI UN `<select>` LARGO NI UN MODAL.                                      │
 * │                                                                          │
 * │ El desplegable nativo es comodo con ocho opciones y desesperante con     │
 * │ setenta: en un movil se convierte en una rueda que hay que recorrer a    │
 * │ ciegas, sin poder buscar.                                                │
 * │                                                                          │
 * │ Y un modal esta descartado en todo el proyecto: en un gimnasio, un       │
 * │ dialogo que roba el foco y tapa la pantalla obliga a recolocarse. Lo     │
 * │ mismo que ya se decidio para las confirmaciones.                         │
 * │                                                                          │
 * │ Asi que se abre EN LINEA, donde estaba el boton, empujando el resto      │
 * │ hacia abajo. No tapa nada y se cierra donde se abrio.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Nacio para la biblioteca de ejercicios y ahora lo comparte con las rutinas.
 * Lo generico es la mecanica —buscar, listar, elegir, cancelar—; que se elige y
 * como se describe cada opcion lo pone quien lo usa.
 */
export interface OpcionEnLinea {
  clave: string;
  titulo: string;
  /** Segunda linea. Se busca tambien aqui: material, grupo, descripcion… */
  detalle?: string;
  /**
   * Por que no se puede elegir esta, si no se puede.
   *
   * Se pinta igualmente, deshabilitada y con el motivo: esconderla dejaria a
   * quien la busca sin entender por que no aparece.
   */
  motivoBloqueo?: string;
}

export function filtrarOpciones(
  opciones: readonly OpcionEnLinea[],
  busqueda: string,
): OpcionEnLinea[] {
  const q = busqueda.trim().toLowerCase();
  if (!q) return [...opciones];
  return opciones.filter((o) => `${o.titulo} ${o.detalle ?? ''}`.toLowerCase().includes(q));
}

export function SelectorEnLinea({
  opciones,
  etiqueta,
  placeholder,
  conBuscador = true,
  tituloVacio,
  textoVacio,
  onElegir,
  onCancelar,
}: {
  opciones: readonly OpcionEnLinea[];
  /** Que se esta eligiendo. Es la etiqueta del buscador, no un titulo decorativo. */
  etiqueta: string;
  placeholder: string;
  /**
   * Con pocas opciones el buscador es ruido: se ven todas de un vistazo. Quien
   * lo usa sabe cuantas hay, asi que lo decide.
   */
  conBuscador?: boolean;
  tituloVacio: string;
  textoVacio: string;
  onElegir: (clave: string) => void;
  onCancelar: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const idBusqueda = 'buscar-en-selector-en-linea';

  const visibles = useMemo(
    () => (conBuscador ? filtrarOpciones(opciones, busqueda) : [...opciones]),
    [opciones, busqueda, conBuscador],
  );

  const buscando = busqueda.trim() !== '';

  return (
    <div className={estilos.selector}>
      <div className={estilos.cabecera}>
        {conBuscador ? (
          <label className={estilos.etiqueta} htmlFor={idBusqueda}>
            {etiqueta}
          </label>
        ) : (
          // Sin buscador no hay campo al que etiquetar, pero el bloque sigue
          // necesitando decir que es.
          <span className={estilos.etiqueta}>{etiqueta}</span>
        )}
        <Boton variante="sutil" tamano="sm" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>

      {conBuscador && (
        <input
          id={idBusqueda}
          type="search"
          className={estilos.buscador}
          placeholder={placeholder}
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          // Es lo unico que se acaba de abrir y para lo que se abrio: escribir.
          autoFocus
        />
      )}

      {visibles.length === 0 ? (
        <EstadoVacio
          titulo={buscando ? 'Nada coincide' : tituloVacio}
          texto={buscando ? 'Prueba con otras palabras.' : textoVacio}
        />
      ) : (
        /*
         * Una lista de botones y no de enlaces: elegir no navega a ningun sitio,
         * cambia lo que hay debajo.
         */
        <ul className={estilos.resultados} aria-label="Resultados">
          {visibles.map((opcion) => (
            <li key={opcion.clave}>
              <button
                type="button"
                className={estilos.resultado}
                disabled={opcion.motivoBloqueo !== undefined}
                onClick={() => onElegir(opcion.clave)}
              >
                <span className={estilos.nombre}>{opcion.titulo}</span>
                {opcion.detalle !== undefined && (
                  <span className={estilos.detalle}>{opcion.detalle}</span>
                )}
                {opcion.motivoBloqueo !== undefined && (
                  <span className={estilos.bloqueo}>{opcion.motivoBloqueo}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
