import type { ReactNode } from 'react';
import estilos from './aviso.module.css';

interface Props {
  tono?: 'error' | 'exito' | 'informacion';
  children: ReactNode;
}

/**
 * Un mensaje que no pertenece a ningun campo.
 *
 * Los de error llevan `role="alert"`: aparecen despues de una accion —enviar el
 * formulario— y quien no ve la pantalla necesita enterarse en ese momento, no
 * al volver a recorrerla. Los informativos no lo llevan: interrumpir la lectura
 * por algo que no ha pasado ahora mismo es ruido.
 */
export function Aviso({ tono = 'error', children }: Props) {
  return (
    <div
      role={tono === 'error' ? 'alert' : undefined}
      className={`${estilos.aviso} ${estilos[tono]}`}
    >
      {children}
    </div>
  );
}
