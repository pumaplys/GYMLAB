'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Icono } from '@/componentes/iconos';
import estilos from './cajon.module.css';

/**
 * El panel de navegacion del movil, para el personal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CAJON MAL HECHO ES PEOR QUE LA TIRA QUE SUSTITUYE.                    │
 * │                                                                          │
 * │ La tira horizontal dejaba "Configuracion" fuera de la pantalla, pero al  │
 * │ menos el foco no se perdia. Un cajon que se abre y suelta el foco detras │
 * │ deja a quien navega con teclado tabulando por una pagina que no ve, y a  │
 * │ un lector de pantalla leyendo el contenido de debajo como si el panel no │
 * │ existiera.                                                               │
 * │                                                                          │
 * │ Por eso aqui hay cuatro cosas y las cuatro son obligatorias: el foco     │
 * │ entra al abrir, queda atrapado dentro, Escape cierra, y al cerrar el     │
 * │ foco VUELVE al boton que lo abrio.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * No usa `<dialog>`: su modo modal mueve el elemento a la capa superior del
 * navegador, y eso ignora el `z-index` del armazon —el cajon aparecia por
 * encima del enlace de salto—. Con un `div` la capa la decidimos nosotros.
 */
export function Cajon({
  abierto,
  onCerrar,
  titulo,
  disparador,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  /** El boton que lo abrio: es a donde vuelve el foco al cerrar. */
  disparador: React.RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  /*
   * Al abrir, el foco entra en el panel. Al cerrar, vuelve de donde vino.
   *
   * El retorno se decide mirando si el foco se ha quedado HUERFANO, no si
   * sigue dentro del panel: cuando el panel se desmonta ya no contiene nada, y
   * el navegador deja el foco en `body`. Comprobar el panel —que es lo que
   * parecia natural— nunca se cumplia, y quien cerraba con Escape se quedaba
   * tabulando desde el principio de la pagina.
   *
   * Si alguien ya movio el foco a otro sitio, no se le roba.
   */
  const estabaAbierto = useRef(false);
  useEffect(() => {
    if (abierto) {
      estabaAbierto.current = true;
      cerrarRef.current?.focus();
      return;
    }
    if (!estabaAbierto.current) return;
    estabaAbierto.current = false;
    const activo = document.activeElement;
    if (!activo || activo === document.body) disparador.current?.focus();
  }, [abierto, disparador]);

  /*
   * Escape cierra, y el tabulador da la vuelta dentro del panel.
   *
   * La trampa de foco se hace a mano y no con una libreria porque son doce
   * lineas y la alternativa es una dependencia con su propio ciclo de vida.
   */
  useEffect(() => {
    if (!abierto) return;

    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        onCerrar();
        return;
      }
      if (evento.key !== 'Tab' || !panel.current) return;

      const focales = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focales.length === 0) return;
      const primero = focales[0]!;
      const ultimo = focales[focales.length - 1]!;

      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto, onCerrar]);

  /* Con el cajon abierto, el fondo no se desplaza. */
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className={estilos.capa}>
      {/*
        El velo cierra al pulsarlo. No lleva `role="button"` ni tabulador: para
        el teclado ya estan Escape y el boton de cerrar, y anadir un objetivo
        focalizable que no dice nada solo alarga el recorrido.
      */}
      <div className={estilos.velo} onClick={onCerrar} aria-hidden="true" />

      <div
        ref={panel}
        className={estilos.panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className={estilos.cabecera}>
          <span className={estilos.titulo}>{titulo}</span>
          <button
            ref={cerrarRef}
            type="button"
            className={estilos.cerrar}
            onClick={onCerrar}
            aria-label="Cerrar la navegacion"
          >
            <Icono nombre="cerrar" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
