import { useId, type ReactNode } from 'react';
import estilos from './campo.module.css';

/**
 * La envoltura de un campo: etiqueta, control, ayuda y error.
 *
 * La usan `Campo` y `Selector`. Existe porque los dos repetian la misma
 * estructura con clases distintas, y porque el desplegable se habia quedado sin
 * ayuda ni error — que es justo por lo que la pantalla de cuota no lo usaba y
 * se habia escrito el suyo a mano.
 *
 * Los tres van atados por `id` y `aria-describedby`, no por proximidad visual:
 * quien use un lector de pantalla oye el error al llegar al campo, no al final
 * del formulario ni en otro orden. Es la diferencia entre un formulario
 * accesible y uno que solo lo parece.
 */
export function EnvolturaDeCampo({
  id,
  etiqueta,
  opcional = false,
  ayuda,
  error,
  children,
}: {
  id: string;
  etiqueta: string;
  opcional?: boolean;
  /** `ReactNode` y no `string`: alguna ayuda destaca una parte con `<strong>`. */
  ayuda?: ReactNode;
  error?: string;
  /** Recibe los `aria-*` ya calculados: el control no tiene que saber montarlos. */
  children: (props: {
    id: string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
    className: string;
  }) => ReactNode;
}) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describedBy = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ');

  return (
    <div className={estilos.campo}>
      <label className={estilos.etiqueta} htmlFor={id}>
        {etiqueta}
        {opcional && <span className={estilos.opcional}>(opcional)</span>}
      </label>

      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
        className: [estilos.control, error ? estilos.conError : ''].filter(Boolean).join(' '),
      })}

      {ayuda && (
        <p id={idAyuda} className={estilos.ayuda}>
          {ayuda}
        </p>
      )}

      {error && (
        <p id={idError} className={estilos.error}>
          {error}
        </p>
      )}
    </div>
  );
}

interface Props {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  alSalir?: () => void;
  tipo?: 'text' | 'email' | 'password' | 'tel' | 'date';
  /** Mensaje de este campo. Si lo hay, el campo se marca como invalido. */
  error?: string;
  /** Aclaracion permanente. Para el formato esperado, no para repetir la etiqueta. */
  ayuda?: ReactNode;
  /**
   * Marca visible de campo opcional.
   *
   * Se senala lo opcional y no lo obligatorio: en un formulario donde casi todo
   * hace falta, el asterisco esta en todas partes y deja de informar.
   */
  opcional?: boolean;
  autoComplete?: string;
  /**
   * Solo para el primer campo de una pantalla cuyo unico contenido es el
   * formulario. Ahi ahorra un tabulador y no le quita el sitio a nada.
   */
  foco?: boolean;
  placeholder?: string;
  deshabilitado?: boolean;
}

/** Un campo de texto con su etiqueta, su ayuda y su error. */
export function Campo({
  etiqueta,
  valor,
  alCambiar,
  alSalir,
  tipo = 'text',
  error,
  ayuda,
  opcional = false,
  autoComplete,
  foco = false,
  placeholder,
  deshabilitado,
}: Props) {
  const id = useId();

  return (
    <EnvolturaDeCampo id={id} etiqueta={etiqueta} opcional={opcional} ayuda={ayuda} error={error}>
      {(props) => (
        <input
          {...props}
          type={tipo}
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          onBlur={alSalir}
          autoComplete={autoComplete}
          autoFocus={foco}
          placeholder={placeholder}
          disabled={deshabilitado}
        />
      )}
    </EnvolturaDeCampo>
  );
}
