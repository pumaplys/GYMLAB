'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import estilos from './pantalla-centrada.module.css';

interface Props {
  titulo: string;
  entradilla?: ReactNode;
  /** Ancho de la tarjeta. `ancha` para listas, como la de gimnasios. */
  ancha?: boolean;
  /**
   * Lleva el foco al titulo al aparecer.
   *
   * Solo para pantallas a las que se llega POR UNA ACCION, no al cargar. Cuando
   * un envio sustituye la pantalla entera, el foco se queda en un boton que ya
   * no existe: quien navega con teclado vuelve al principio del documento y
   * quien usa lector de pantalla no se entera de que ha cambiado nada. Traerlo
   * al titulo lo anuncia y deja el tabulador donde toca.
   */
  enfocarTitulo?: boolean;
  /** Opcional: hay callejones sin salida donde no queda nada que ofrecer. */
  children?: ReactNode;
}

/**
 * Las pantallas que ocupan la ventana entera y no llevan navegacion: entrar,
 * elegir gimnasio, y los callejones sin salida (sin permiso, sin gimnasios).
 *
 * Van sin cabecera a proposito. En todas ellas no hay a donde ir todavia, y una
 * barra con secciones que no se pueden abrir invita a probarlas.
 */
export function PantallaCentrada({
  titulo,
  entradilla,
  ancha = false,
  enfocarTitulo = false,
  children,
}: Props) {
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (enfocarTitulo) tituloRef.current?.focus();
  }, [enfocarTitulo]);

  return (
    <main className={estilos.pantalla}>
      <div className={estilos.tarjeta} style={ancha ? { maxWidth: '32rem' } : undefined}>
        <p className={estilos.marca}>GYMLAB</p>
        <h1
          className={estilos.titulo}
          ref={tituloRef}
          // Solo alcanzable por programa: `-1` deja enfocarlo sin meterlo en el
          // recorrido del tabulador, donde un titulo no pinta nada.
          tabIndex={enfocarTitulo ? -1 : undefined}
        >
          {titulo}
        </h1>
        {entradilla && <p className={estilos.entradilla}>{entradilla}</p>}
        {children}
      </div>
    </main>
  );
}
