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
  /*
   * Tres marcas y tres lineas: la rutina que se va tachando.
   *
   * ANTES era un rectangulo con lineas dentro, y a 24 px eso es exactamente
   * la misma silueta que el Carne: un marco. Se quita el marco entero. Lo que
   * queda son marcas sueltas sobre el fondo, con el peso a la IZQUIERDA — al
   * lado del Carne, que lo tiene repartido en las esquinas, se distinguen sin
   * leer la palabra.
   */
  rutina: (
    <>
      <Path d="M4 7 5.5 8.5 8.2 5.8" />
      <Path d="M11.8 7h8.2" />
      <Path d="M4 12.5 5.5 14 8.2 11.3" />
      <Path d="M11.8 12.5h8.2" />
      <Path d="M4 18 5.5 19.5 8.2 16.8" />
      <Path d="M11.8 18h8.2" />
    </>
  ),
  /*
   * Tres esquinas y unos modulos sueltos: la silueta de un codigo.
   *
   * ANTES era una tarjeta con una foto y unas lineas —un marco horizontal—
   * que a 24 px se confundia con la lista. Ahora la silueta es CUADRADA y con
   * mucho hueco: tres cuadrados en las esquinas, que es lo que el ojo
   * reconoce como codigo antes de leer nada.
   *
   * No se intenta dibujar un codigo de verdad: a este tamaño seria una
   * mancha, y ademas el codigo real lo pinta la pantalla del Carne.
   */
  carne: (
    <>
      <Rect x={3.5} y={3.5} width={6.5} height={6.5} rx={1.5} />
      <Rect x={14} y={3.5} width={6.5} height={6.5} rx={1.5} />
      <Rect x={3.5} y={14} width={6.5} height={6.5} rx={1.5} />
      <Path d="M14 14.5h6.5M14 18h3M17.5 20.5h3" />
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
  /*
   * Una punta de flecha: "esto lleva a otro sitio".
   *
   * El unico que no es un destino de la barra. Lo pide Inicio, donde las
   * secciones son filas que se pulsan, y comparte el mismo trazo: dibujado con
   * otro grosor se veria que es de otra familia.
   */
  avanzar: <Path d="m9.5 5.5 7 6.5-7 6.5" />,
};
