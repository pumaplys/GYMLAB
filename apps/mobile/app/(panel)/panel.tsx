import { AreaEnConstruccion } from '../../src/componentes/area-en-construccion';

/**
 * La puerta de entrada del personal de gestion.
 *
 * De momento solo dice que esta cuenta ya entra. Lo que vendra —el escaner de
 * la puerta, buscar un socio, su cuota— es de las fases siguientes, y hasta
 * entonces esta pantalla NO finge tenerlo.
 */
export default function Panel() {
  return <AreaEnConstruccion titulo="Panel" quien="personal del gimnasio" />;
}
