import type { ReactNode } from 'react';
import estilos from './aviso.module.css';

interface Props {
  tono?: 'error' | 'exito' | 'aviso' | 'informacion';
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
 * Los de AVISO tampoco: describen un estado que ya estaba ahi —"faltan datos"—
 * y no algo que acabe de ocurrir. Este tono existia en `Etiqueta` y no aqui, y
 * por eso /configuracion tenia que elegir entre el rojo de un error que no lo
 * es y el azul de una informacion que si urge. Se anade ahora, con su primer
 * consumidor de verdad; no antes, que es como se acumula API muerta.
 *
 * Los informativos no llevan ninguno: interrumpir la lectura por algo que no ha
 * pasado ahora mismo es ruido.
 */
const PAPEL = {
  error: 'alert',
  exito: 'status',
  aviso: undefined,
  informacion: undefined,
} as const;

/*
 * El tono se traduce a su clase por un mapa y no con `estilos[tono]`.
 *
 * El modulo ya tiene una clase `.aviso` —la base, la que da caja y relleno— asi
 * que el tono llamado "aviso" habria devuelto ESA en lugar de su color. Un
 * choque silencioso: compila, se pinta, y el unico sintoma es que el mensaje
 * sale sin color.
 */
const CLASE = {
  error: estilos.error,
  exito: estilos.exito,
  aviso: estilos.avisoTono,
  informacion: estilos.informacion,
} as const;

export function Aviso({ tono = 'error', children }: Props) {
  return (
    <div role={PAPEL[tono]} className={`${estilos.aviso} ${CLASE[tono]}`}>
      {children}
    </div>
  );
}
