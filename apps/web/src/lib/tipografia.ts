import localFont from 'next/font/local';

/**
 * Inter, alojada por nosotros.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE NO SE USA LA PILA DEL SISTEMA.                                   │
 * │                                                                          │
 * │ `system-ui` es Segoe UI en Windows y SF Pro en macOS. Recepcion trabaja  │
 * │ en Windows y las capturas comerciales salen de un Mac: el producto NO    │
 * │ se veia igual en los dos sitios, y las diferencias de ancho de Segoe UI  │
 * │ descolocaban tablas que en Mac cuadraban.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Y POR QUE `next/font/local` Y NO `next/font/google`.                     │
 * │                                                                          │
 * │ `next/font/google` tambien aloja el resultado, pero lo DESCARGA de       │
 * │ Google al construir: la compilacion pasa a depender de que ese servicio  │
 * │ este disponible. El fichero viene de `node_modules`, del bloqueo de      │
 * │ dependencias, y la construccion no sale a internet.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * UN SOLO FICHERO, Y ES EL MAS PEQUENO
 *
 * Se usan cuatro pesos —400 cuerpo, 500 etiquetas, 600 titulos, 700 la marca—.
 * Medido: cuatro ficheros estaticos latinos suman 94,5 kB; la variable de eje
 * `wght`, sola, 47,1 kB. La mitad y una peticion en vez de cuatro.
 *
 * Solo el eje de grosor y solo latino: fuera la cursiva —que no se usa en
 * ningun sitio— y fuera el eje de tamano optico, que sube el fichero a 130 kB
 * sin que nadie lo aproveche.
 */
export const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--fuente',
  /**
   * La pila de reserva, y el ajuste que evita el salto.
   *
   * `adjustFontFallback` reescala la fuente de reserva para que ocupe casi lo
   * mismo que Inter mientras esta carga. Sin eso, `display: swap` produce el
   * salto de maquetacion clasico al terminar la descarga: el texto cambia de
   * ancho y las tablas se recolocan delante de quien esta leyendo.
   */
  adjustFontFallback: 'Arial',
  fallback: [
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ],
});
