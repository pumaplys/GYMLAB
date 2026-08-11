import type { ReactNode } from 'react';
import estilos from './tarjeta.module.css';

/**
 * La superficie blanca sobre la que se apoya todo: fondo, borde de un pixel y
 * radio. Estaba repetida en cinco ficheros con dos nombres, `.tarjeta` y
 * `.panel`, que son la misma superficie con distinto relleno.
 *
 * Dos variantes y ni una mas:
 *
 *   contenido  lleva relleno. Formularios y bloques de texto.
 *   lista      sin relleno y recortando lo que sobresalga, para que una tabla
 *              respete las esquinas redondeadas.
 *
 * El ANCHO y los MARGENES no son suyos: los pone quien la coloca, con
 * `className`. Una tarjeta no sabe cuanto debe medir; la pantalla si.
 */
interface Props {
  variante?: 'contenido' | 'lista';
  children: ReactNode;
  className?: string;
}

export function Tarjeta({ variante = 'contenido', children, className }: Props) {
  return (
    <div className={`${estilos.tarjeta} ${estilos[variante]} ${className ?? ''}`.trim()}>
      {children}
    </div>
  );
}
