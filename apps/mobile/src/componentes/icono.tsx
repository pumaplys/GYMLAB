import { Circle, Path, Rect, Svg } from 'react-native-svg';
import type { ReactNode } from 'react';
import { tema } from '../tema';

/**
 * Los iconos de la navegacion. Cinco, dibujados aqui.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE NO HAY LIBRERIA DE ICONOS.                                       │
 * │                                                                          │
 * │ Hacen falta CINCO, todos para el mismo sitio y todos del mismo estilo.   │
 * │ `@expo/vector-icons` viene con el SDK y traeria cuatro juegos completos  │
 * │ —mas de diez mil glifos y sus tipografias— con un estilo que no es el    │
 * │ nuestro, para resolver cinco trazos. Y el coste de mantenerlos es cero:  │
 * │ no crecen. Los destinos del producto son los que son.                    │
 * │                                                                          │
 * │ Es la misma decision que ya tomo el panel web, y por eso el DIBUJO es el │
 * │ mismo: rejilla de 24, trazo de 1.5, extremos redondeados. Se han adaptado │
 * │ los trazos, no los componentes: alli son `<svg>` del DOM, aqui son de    │
 * │ `react-native-svg`, y compartirlos habria significado meter el DOM en la │
 * │ app.                                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `react-native-svg` entra por `expo install` en la version que fija el SDK
 * (15.15.4) y hara falta igualmente para el codigo del Carne, asi que se
 * adelanta aqui en vez de dibujar los iconos dos veces.
 *
 * SIEMPRE decorativos. Un icono de navegacion no es informacion: al lado
 * siempre va su palabra. Quien no ve el icono lee el texto, y un lector de
 * pantalla que los anunciara leeria cada destino dos veces.
 */
import type { NombreDeIcono } from '../navegacion/destinos';
export type { NombreDeIcono };

export function Icono({
  nombre,
  color = tema.color.textoSecundario,
  tamano = 24,
}: {
  nombre: NombreDeIcono;
  color?: string;
  tamano?: number;
}) {
  return (
    <Svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DIBUJOS[nombre]}
    </Svg>
  );
}

const DIBUJOS: Record<NombreDeIcono, ReactNode> = {
  /* Una casa: donde se empieza. */
  inicio: (
    <>
      <Path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.6Z" />
      <Path d="M9.5 20.5v-6h5v6" />
    </>
  ),
  /* Una lista con marcas: la rutina del dia. */
  rutina: (
    <>
      <Rect x={4.5} y={4} width={15} height={16} rx={2.5} />
      <Path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h4" />
    </>
  ),
  /* Un carne con su codigo. */
  carne: (
    <>
      <Rect x={3.5} y={5} width={17} height={14} rx={2.5} />
      <Rect x={6.5} y={8.5} width={4.5} height={4.5} rx={1} />
      <Path d="M6.5 16h4.5M14 9.5h4M14 12.5h4M14 15.5h2.5" />
    </>
  ),
  /* Una linea que sube. */
  progreso: (
    <>
      <Path d="M4 19.5h16" />
      <Path d="M5.5 15.5 10 11l3.2 3.2L19 8" />
      <Path d="M15.6 8H19v3.4" />
    </>
  ),
  /*
   * Una persona. En la web el icono equivalente son DOS —es el listado de
   * socios— y aqui es una sola: este destino es la cuenta de quien mira.
   */
  perfil: (
    <>
      <Circle cx={12} cy={8} r={3.5} />
      <Path d="M5.5 20c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5" />
    </>
  ),
};
