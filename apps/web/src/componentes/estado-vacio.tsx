import estilos from './estado-vacio.module.css';

/**
 * Lo que ve alguien cuando una lista todavia no tiene nada.
 *
 * Dos frases y no una: la primera dice QUE pasa —«todavia no hay planes»— y la
 * segunda QUE HACER o por que importa. Una lista vacia sin explicacion parece
 * un fallo de carga.
 *
 * No sirve para el «sin datos» de una linea suelta dentro de una ficha: eso es
 * un texto atenuado, no un estado de pantalla, y se queda donde esta.
 */
export function EstadoVacio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className={estilos.vacio}>
      <p className={estilos.titulo}>{titulo}</p>
      <p className={estilos.texto}>{texto}</p>
    </div>
  );
}
