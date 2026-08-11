import type { ReactNode } from 'react';
import estilos from './encabezado-de-pagina.module.css';

/**
 * El titulo de una pantalla, su explicacion y las acciones que la acompañan.
 *
 * La entradilla no es decorativa: es donde se dice lo que la pantalla NO hace
 * obvio —que una cuota nace vencida, que los planes los crea el dueno— y es lo
 * que evita tener que explicarlo por telefono.
 *
 * `alineacion` existe porque hay dos casos reales, no por si acaso:
 *
 *   arriba  el titulo lleva entradilla, y la accion se alinea con el titulo.
 *   centro  no hay entradilla y la accion se centra con el, como en socios.
 */
interface Props {
  titulo: string;
  entradilla?: ReactNode;
  acciones?: ReactNode;
  alineacion?: 'arriba' | 'centro';
}

export function EncabezadoDePagina({
  titulo,
  entradilla,
  acciones,
  alineacion = 'arriba',
}: Props) {
  return (
    <div className={`${estilos.encabezado} ${estilos[alineacion]}`}>
      <div>
        <h1>{titulo}</h1>
        {entradilla && <p className={estilos.entradilla}>{entradilla}</p>}
      </div>
      {acciones}
    </div>
  );
}
