import { useId, type ReactNode } from 'react';
import estilos from './selector.module.css';

/**
 * Un desplegable con su etiqueta.
 *
 * `Campo` cubre los `input` pero no los `select`, asi que las tres pantallas
 * que tienen uno —personal, planes y la cuota de la ficha— se habian escrito
 * cada una el suyo: mismo aspecto, tres copias.
 *
 * La etiqueta va atada por `id` y no por proximidad visual: quien use un lector
 * de pantalla tiene que oir de que es el desplegable al llegar a el.
 *
 * El ANCHO lo pone quien lo coloca. Un desplegable de planes quiere caber en su
 * fila; el de roles, no. No es asunto del componente.
 */
interface Props {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  children: ReactNode;
  className?: string;
  deshabilitado?: boolean;
}

export function Selector({
  etiqueta,
  valor,
  alCambiar,
  children,
  className,
  deshabilitado,
}: Props) {
  const id = useId();

  return (
    <div className={estilos.campo}>
      <label className={estilos.etiqueta} htmlFor={id}>
        {etiqueta}
      </label>
      <select
        id={id}
        className={`${estilos.selector} ${className ?? ''}`.trim()}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        disabled={deshabilitado}
      >
        {children}
      </select>
    </div>
  );
}
