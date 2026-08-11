import type { ReactNode } from 'react';
import estilos from './tabla.module.css';

/**
 * La tabla de un listado de gestion: cabeceras en versalita, filas separadas
 * por una linea y la ultima sin ella.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO TODAS LAS TABLAS DEL PANEL SON ESTA, Y NO SE FUERZAN.                 │
 * │                                                                          │
 * │ La de socios tiene MENOS relleno —lleva mas columnas—, cabeceras que no  │
 * │ se parten y una fila que se ilumina al pasar por encima, porque es un    │
 * │ indice en el que se pulsa. La de pagos de la ficha usa otro relleno       │
 * │ porque vive dentro de una tarjeta mas estrecha.                          │
 * │                                                                          │
 * │ Meterlas aqui con banderas para cada diferencia daria un componente que  │
 * │ nadie entiende. Se quedan fuera a proposito.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Tabla({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={`${estilos.tabla} ${className ?? ''}`.trim()}>{children}</table>;
}
