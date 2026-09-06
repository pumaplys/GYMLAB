import { AreaEnConstruccion } from '../../src/componentes/area-en-construccion';

/**
 * La puerta de entrada del entrenador.
 *
 * "Mis socios" —`/me/trainer/members`, que ya existe en la API— es de la fase
 * siguiente. Aqui todavia no hay lista, y no se finge que la haya.
 */
export default function Entrenador() {
  return <AreaEnConstruccion titulo="Entrenador" quien="entrenador" />;
}
