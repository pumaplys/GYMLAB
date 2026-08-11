import { Boton } from './boton';
import estilos from './confirmacion-en-linea.module.css';

/**
 * «¿Retirar el acceso? Sí / No», al lado del boton que se acaba de pulsar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE AQUI NO HAY UN MODAL.                                            │
 * │                                                                          │
 * │ En un mostrador con gente esperando, un dialogo que roba el foco y tapa  │
 * │ la pantalla obliga a recolocarse: donde estaba, que fila era. La         │
 * │ confirmacion en linea deja la fila a la vista y el «No» al lado del      │
 * │ «Si», que es lo que se pulsa el 90 % de las veces.                       │
 * │                                                                          │
 * │ Es una decision de producto, no una limitacion.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * No sirve para la confirmacion de dar de baja a un socio: esa vive dentro de
 * un recuadro con fondo de peligro porque no esta pegada a su boton, y se
 * queda como esta.
 */
interface Props {
  pregunta: string;
  confirmando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ConfirmacionEnLinea({ pregunta, confirmando, onConfirmar, onCancelar }: Props) {
  return (
    <span className={estilos.confirmar}>
      {pregunta}
      <Boton variante="sutil" cargando={confirmando} onClick={onConfirmar}>
        Si
      </Boton>
      <Boton variante="sutil" onClick={onCancelar}>
        No
      </Boton>
    </span>
  );
}
