import { useId, type ReactNode } from 'react';
import { EnvolturaDeCampo } from './campo';

/**
 * Un desplegable con su etiqueta, su ayuda y su error.
 *
 * `Campo` cubre los `input` pero no los `select`, asi que las pantallas que
 * tienen uno —personal, planes y la cuota de la ficha— se habian escrito cada
 * una el suyo: mismo aspecto, tres copias. La de cuota ademas se quedo fuera
 * cuando esto se extrajo, porque necesitaba ayuda y error y aqui no habia.
 * Ahora comparte envoltura con `Campo`, asi que los tiene.
 *
 * El ANCHO lo pone quien lo coloca. Un desplegable de planes quiere caber en su
 * fila; el de roles, no. No es asunto del componente.
 */
interface Props {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  children: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  className?: string;
  deshabilitado?: boolean;
}

export function Selector({
  etiqueta,
  valor,
  alCambiar,
  children,
  ayuda,
  error,
  className,
  deshabilitado,
}: Props) {
  const id = useId();

  return (
    <EnvolturaDeCampo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(props) => (
        <select
          {...props}
          className={`${props.className} ${className ?? ''}`.trim()}
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          disabled={deshabilitado}
        >
          {children}
        </select>
      )}
    </EnvolturaDeCampo>
  );
}
