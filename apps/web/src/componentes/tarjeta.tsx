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
 *   lista      sin relleno, para tablas. En estrecho, la tabla se desplaza
 *              dentro del cuerpo y la cabecera se queda quieta.
 *
 * `titulo` y `acciones` dibujan una cabecera separada por un filete. Se anaden
 * porque `cuota` ya la tenia escrita a mano —con su propio `.bloque`, su propia
 * `.cabecera` y su propio relleno— y era la ultima superficie del panel que
 * seguia siendo una copia de esta. Sin cabecera, se comporta igual que antes.
 *
 * El relleno vive en el CUERPO y no en la tarjeta: si estuviera en la tarjeta,
 * el filete de la cabecera no llegaria a los bordes. Y el desplazamiento
 * horizontal vive tambien en el cuerpo y no en la tarjeta, porque si no la
 * cabecera se iria de lado junto con la tabla.
 *
 * El ANCHO y los MARGENES no son suyos: los pone quien la coloca, con
 * `className`. Una tarjeta no sabe cuanto debe medir; la pantalla si.
 */
interface Props {
  variante?: 'contenido' | 'lista';
  titulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Tarjeta({ variante = 'contenido', titulo, acciones, children, className }: Props) {
  return (
    <div className={`${estilos.tarjeta} ${className ?? ''}`.trim()}>
      {(titulo || acciones) && (
        <div className={estilos.cabecera}>
          {titulo}
          {acciones}
        </div>
      )}
      <div className={estilos[variante]}>{children}</div>
    </div>
  );
}
