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
 * al volver a recorrerla.
 *
 * Los de exito llevan `role="status"`, que anuncia sin interrumpir. Aparecen por
 * lo mismo —acaba de pasar algo— pero no urge: "asignada" se puede esperar a
 * que termine la frase en curso. Sin esto, una accion que no cambia de pantalla
 * —asignar una rutina, invitar a alguien— era invisible para un lector.
 *
 * Los informativos no llevan ninguno: interrumpir la lectura por algo que no ha
 * pasado ahora mismo es ruido.
 */
const PAPEL = { error: 'alert', exito: 'status', informacion: undefined } as const;

export function Aviso({ tono = 'error', children }: Props) {
  return (
    <div role={PAPEL[tono]} className={`${estilos.aviso} ${estilos[tono]}`}>
      {children}
    </div>
  );
}
