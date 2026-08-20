import type { ReactNode } from 'react';
import estilos from './tarjeta.module.css';

/**
 * La superficie blanca sobre la que se apoya todo: fondo, borde de un pixel y
 * radio. Estaba repetida en cinco ficheros con dos nombres, `.tarjeta` y
 * `.panel`, que son la misma superficie con distinto relleno.
 *
 * Tres variantes:
 *
 *   contenido  lleva relleno. Formularios y bloques de texto.
 *   lista      sin relleno, para tablas. En estrecho, la tabla se desplaza
 *              dentro del cuerpo y la cabecera se queda quieta.
 *   seccion    SIN caja: solo el ritmo vertical y la cabecera.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CUANDO NO SE USA UNA TARJETA. Regla escrita en D1.                       │
 * │                                                                          │
 * │ Una tarjeta significa "esto es una unidad aparte del resto". Cuando toda │
 * │ la pantalla son tarjetas, deja de significar nada: la ficha del socio    │
 * │ son cinco cajas de 203, 239, 222, 117 y 221 px de alto, apiladas, y      │
 * │ ninguna destaca sobre las demas — medido antes de D1.                    │
 * │                                                                          │
 * │   superficie  el fondo de la pagina. No es un componente.                │
 * │   seccion     un bloque con titulo dentro de una pantalla. Lo normal.    │
 * │   tarjeta     algo que se lee o se opera como una unidad: una tabla, un  │
 * │               formulario. Como mucho dos o tres por pantalla.            │
 * │   destacado   la tarjeta con la accion principal. UNA, o ninguna.        │
 * │                                                                          │
 * │ D1 solo deja la variante disponible. Cambiar la composicion de cada      │
 * │ pantalla es trabajo de D3 a D5.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
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
  variante?: 'contenido' | 'lista' | 'seccion';
  titulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Tarjeta({ variante = 'contenido', titulo, acciones, children, className }: Props) {
  return (
    <div
      className={[variante === 'seccion' ? estilos.seccion : estilos.tarjeta, className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {(titulo || acciones) && (
        <div className={estilos.cabecera}>
          {titulo}
          {acciones}
        </div>
      )}
      <div className={variante === 'seccion' ? estilos.cuerpoSeccion : estilos[variante]}>
        {children}
      </div>
    </div>
  );
}
