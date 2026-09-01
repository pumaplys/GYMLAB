import { Pantalla } from '../../src/componentes/pantalla';
import { Marcador } from '../../src/componentes/marcador';

/**
 * Marcador de M3.
 *
 * Cuando exista, esta pantalla NO sera desplazable: un carne que hay que
 * enseñar en un torno se mira entero de un vistazo.
 */
export default function Carne() {
  return (
    <Pantalla titulo="Carne" descriptor="Tu acceso al gimnasio">
      <Marcador fase="M6" />
    </Pantalla>
  );
}
