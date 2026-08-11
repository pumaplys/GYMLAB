import type { ReactNode } from 'react';
import estilos from './etiqueta.module.css';

/**
 * Una pastilla de estado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTABA COPIADA EN CINCO SITIOS, Y EN DOS DE ELLOS BYTE A BYTE.           │
 * │                                                                          │
 * │ `socios` y la ficha tenian `.etiqueta`, `.activo` e `.inactivo`          │
 * │ identicos. Personal, cuota y planes tenian su propia version. Cinco       │
 * │ implementaciones del mismo lenguaje visual, y cinco sitios donde tocar    │
 * │ cuando cambiara.                                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El TONO dice que significa, no de que color es: quien la use elige entre
 * "esto va bien" y "esto esta vencido", no entre verde y rojo. El dia que
 * cambien los colores, cambian aqui y en ningun sitio mas.
 */
export type TonoDeEtiqueta = 'exito' | 'peligro' | 'aviso' | 'neutro' | 'acento';

interface Props {
  tono: TonoDeEtiqueta;
  children: ReactNode;
  /** Para el hueco que ocupa —margenes—, que es cosa de quien la coloca. */
  className?: string;
}

export function Etiqueta({ tono, children, className }: Props) {
  return (
    <span className={`${estilos.etiqueta} ${estilos[tono]} ${className ?? ''}`.trim()}>
      {children}
    </span>
  );
}
