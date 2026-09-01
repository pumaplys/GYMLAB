import { Pantalla } from '../../src/componentes/pantalla';
import { Marcador } from '../../src/componentes/marcador';

/** Marcador de M3. La pantalla de verdad llega en M4. */
export default function Inicio() {
  return (
    <Pantalla titulo="Inicio" descriptor="Tu espacio">
      <Marcador fase="M4" />
    </Pantalla>
  );
}
