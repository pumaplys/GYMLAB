import type { ReactNode } from 'react';
import estilos from './encabezado-de-pagina.module.css';

/**
 * El titulo de una pantalla, su explicacion y las acciones que la acompañan.
 *
 * La entradilla no es decorativa: es donde se dice lo que la pantalla NO hace
 * obvio —que una cuota nace vencida, que los planes los crea el dueno— y es lo
 * que evita tener que explicarlo por telefono.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE DESAPARECIO `alineacion`.                                        │
 * │                                                                          │
 * │ Habia dos modos —`arriba` y `centro`— y elegian si el titulo se alineaba │
 * │ con la accion o se centraba con ella. El efecto medido: el `h1` caia a   │
 * │ 142 px en socios y a 138 en personal y planes. Ocho pixeles de salto     │
 * │ cada vez que se cambia de pantalla, en el elemento que la gente usa      │
 * │ para saber donde esta.                                                   │
 * │                                                                          │
 * │ Ahora el titulo y las acciones comparten una FILA de alto fijo y se      │
 * │ centran en ella, y la entradilla va debajo de esa fila. El `h1` cae      │
 * │ siempre en la misma coordenada, haya entradilla o no, haya acciones o    │
 * │ no — y nadie tiene que elegir nada.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Props {
  titulo: string;
  /**
   * Lo que acompana al titulo en su misma linea: el numero de socio, la
   * etiqueta de estado. Existe porque la ficha se habia escrito su propio
   * encabezado entero solo para poder poner eso al lado del nombre.
   */
  junto?: ReactNode;
  entradilla?: ReactNode;
  acciones?: ReactNode;
}

export function EncabezadoDePagina({ titulo, junto, entradilla, acciones }: Props) {
  return (
    <div className={estilos.encabezado}>
      <div className={estilos.fila}>
        <div className={estilos.identidad}>
          <h1>{titulo}</h1>
          {junto}
        </div>
        {acciones}
      </div>
      {entradilla && <p className={estilos.entradilla}>{entradilla}</p>}
    </div>
  );
}
