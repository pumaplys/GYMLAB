import { Pantalla } from '../../src/componentes/pantalla';
import { Marcador } from '../../src/componentes/marcador';

/** Marcador de M3. */
export default function Rutina() {
  return (
    <Pantalla titulo="Rutina" descriptor="Tu entrenamiento">
      <Marcador fase="M5" />
    </Pantalla>
  );
}
