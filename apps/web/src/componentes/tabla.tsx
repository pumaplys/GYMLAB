import type { ReactNode } from 'react';
import estilos from './tabla.module.css';

/**
 * La tabla de un listado de gestion: cabeceras en versalita, filas separadas
 * por una linea y la ultima sin ella.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ HABIA TRES TABLAS ESCRITAS TRES VECES, Y SOLO UNA DIFERENCIA ERA REAL.   │
 * │                                                                          │
 * │ Socios, planes/personal y los pagos de la ficha tenian cada uno su       │
 * │ `<table>` con su relleno —`--e4`, `--e5` y `--e6`—, sus cabeceras y sus  │
 * │ separadores. De todo eso, lo unico que significaba algo era el resalte    │
 * │ al pasar por encima: en socios cada fila abre una ficha, y en las otras  │
 * │ dos las filas no llevan a ningun sitio.                                  │
 * │                                                                          │
 * │ Asi que esa diferencia es una opcion —`filasPulsables`— y el resto se     │
 * │ unifica. Lo que NO se hace es meter aqui una bandera por cada matiz de   │
 * │ cada pantalla: si algun dia una tabla necesita de verdad otra cosa,      │
 * │ tendra su propio componente antes que este once parametros.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Tabla({
  filasPulsables = false,
  children,
  className,
}: {
  /** Resalta la fila al pasar por encima. Solo si la fila lleva a algun sitio. */
  filasPulsables?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    /*
     * El desplazamiento horizontal es de la TABLA, no de la tarjeta.
     *
     * Medido en socios a 375 px: con el `overflow` puesto en el cuerpo de la
     * tarjeta, al desplazar la tabla se iba con ella la paginacion, que es su
     * hermana — pasaba de x=17 a x=-338 y desaparecia por la izquierda. Aqui
     * dentro, lo unico que se mueve es la tabla, y la paginacion, el estado
     * vacio y cualquier otra cosa de la tarjeta se quedan donde estan.
     */
    <div className={estilos.desplazable}>
      <table
        className={[estilos.tabla, filasPulsables ? estilos.pulsables : '', className ?? '']
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </table>
    </div>
  );
}

/**
 * Modificadores de celda.
 *
 * Se exportan como clases y no como componentes `<Celda>` porque un `<td>`
 * lleva `colSpan`, `scope` y demas atributos propios, y envolverlo obligaria a
 * reenviarlos todos para no ganar nada.
 *
 *   numerica  importes y contadores: a la derecha y con digitos de ancho fijo.
 *   acciones  la ultima columna, la de los botones.
 *   tenue     dato secundario dentro de una fila.
 */
export const celda = {
  numerica: estilos.numerica,
  acciones: estilos.acciones,
  tenue: estilos.tenue,
} as const;
