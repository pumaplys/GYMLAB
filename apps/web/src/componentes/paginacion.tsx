import { Boton } from '@/componentes/boton';
import estilos from './paginacion.module.css';

interface Props {
  pagina: number;
  tamano: number;
  total: number;
  /** Se llama con la pagina destino, nunca con un incremento. */
  alCambiar: (pagina: number) => void;
  deshabilitada?: boolean;
}

/**
 * Anterior / siguiente, y cuantos hay.
 *
 * Sin numeros de pagina: con un buscador delante, nadie salta a la pagina 7 a
 * proposito. Lo que si hace falta siempre es saber cuantos son en total, que es
 * el dato que responde "¿estan todos?".
 */
export function Paginacion({ pagina, tamano, total, alCambiar, deshabilitada = false }: Props) {
  const ultima = Math.max(1, Math.ceil(total / tamano));
  const primero = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const ultimo = Math.min(pagina * tamano, total);

  return (
    <div className={estilos.paginacion}>
      <p className={estilos.resumen} aria-live="polite">
        {total === 0 ? 'Sin resultados' : `${primero}–${ultimo} de ${total}`}
      </p>

      <div className={estilos.botones}>
        <Boton onClick={() => alCambiar(pagina - 1)} disabled={deshabilitada || pagina <= 1}>
          Anterior
        </Boton>
        <Boton onClick={() => alCambiar(pagina + 1)} disabled={deshabilitada || pagina >= ultima}>
          Siguiente
        </Boton>
      </div>
    </div>
  );
}
