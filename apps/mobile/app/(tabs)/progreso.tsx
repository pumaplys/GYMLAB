import { Pantalla } from '../../src/componentes/pantalla';
import { Marcador } from '../../src/componentes/marcador';

/** Marcador de M3. */
export default function Progreso() {
  return (
    <Pantalla titulo="Progreso" descriptor="Tu evolucion">
      <Marcador fase="M7" />
    </Pantalla>
  );
}
