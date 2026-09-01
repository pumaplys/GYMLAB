/**
 * De un token a la matriz de modulos del QR. Sin React y sin pintar nada.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL QR SE DIBUJA AQUI PORQUE LA API NO LO MANDA DIBUJADO.                 │
 * │                                                                          │
 * │ `POST /me/access/token` devuelve `{ token, expiresAt, ttlSeconds }` y el  │
 * │ token es una cadena opaca de 119 caracteres base64url. NO hay SVG en el   │
 * │ contrato, asi que no hay nada que mostrar tal cual: pintarlo es del       │
 * │ cliente, igual que ya hace el panel web.                                  │
 * │                                                                          │
 * │ Y con el MISMO codificador que la web —`qrcode`, correccion 'M'— para que │
 * │ los dos produzcan el mismo dibujo para el mismo token. Si divergieran,    │
 * │ un escaner podria leer uno y no el otro.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE IMPORTA EL NUCLEO, NO EL PAQUETE ENTERO.                             │
 * │                                                                          │
 * │ `qrcode` de raiz arrastra sus dibujantes: `fs`, `pngjs` y `yargs` —una    │
 * │ interfaz de linea de comandos— que en un telefono no pintan nada. El      │
 * │ nucleo es JavaScript puro: no usa el `Buffer` de Node en ninguna parte    │
 * │ (comprobado), asi que funciona igual en React Native que en el navegador. │
 * │                                                                          │
 * │ Es la misma via que usa `react-native-qrcode-svg`, y por eso no hace      │
 * │ falta esa dependencia: lo unico que aporta es dibujar rectangulos, y eso  │
 * │ lo hace `CodigoDeAcceso` con react-native-svg en veinte lineas.          │
 * │                                                                          │
 * │ Al ser una ruta interna del paquete, hay un test que comprueba que el     │
 * │ modulo sigue teniendo la forma esperada: si una version lo mueve, salta   │
 * │ ahi y no en el telefono de alguien delante de un torno.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import crear from 'qrcode/lib/core/qrcode.js';

export interface MatrizQr {
  /** Modulos por lado, sin contar el margen. */
  lado: number;
  /** `true` = modulo oscuro. Longitud `lado * lado`, por filas. */
  modulos: readonly boolean[];
}

/**
 * La correccion de errores. 'M' recupera hasta un 15% del codigo dañado.
 *
 * Es la que usa el panel web. Subir a 'Q' o 'H' mete mas modulos en el mismo
 * espacio —el codigo se hace mas denso y cada modulo mas pequeño— y en una
 * pantalla que se enseña limpia, sin arrugas ni manchas, eso resta legibilidad
 * en lugar de sumarla.
 */
const CORRECCION = 'M';

export function matrizDe(token: string): MatrizQr {
  if (!token) throw new Error('No hay token que codificar.');

  const qr = crear.create(token, { errorCorrectionLevel: CORRECCION });
  const lado = qr.modules.size;
  const datos = qr.modules.data;

  const modulos: boolean[] = new Array(lado * lado);
  for (let i = 0; i < modulos.length; i++) modulos[i] = datos[i] === 1;

  return { lado, modulos };
}

/** El margen obligatorio alrededor del codigo, en modulos. */
export const MARGEN_EN_MODULOS = 4;

export interface Camino {
  /** El atributo `d` de un unico `<Path>` con todos los modulos oscuros. */
  d: string;
  /** El lado del lienzo en modulos, margen incluido. Es el viewBox. */
  lienzo: number;
}

/**
 * Convierte la matriz en UN solo camino.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CAMINO, NO MIL RECTANGULOS.                                          │
 * │                                                                          │
 * │ Un codigo de 37x37 son 1.369 posiciones. Dibujar una vista nativa por    │
 * │ cada modulo oscuro es como se pone lento algo que solo tiene que         │
 * │ aparecer, y en un telefono modesto se nota al abrir la pantalla.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL TOKEN NO PUEDE ACABAR DENTRO DEL SVG.                                │
 * │                                                                          │
 * │ Aqui no se interpola texto: solo salen numeros calculados a partir de la │
 * │ POSICION de cada modulo. No hay parser de SVG, no hay XML de nadie y no  │
 * │ hay ningun sitio donde un token con caracteres raros pudiera colarse     │
 * │ como marcado. Hay un test que lo comprueba con un token hostil.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El margen va DENTRO del lienzo y en modulos: la norma pide cuatro modulos
 * de zona en blanco alrededor, y sin ella el lector no encuentra donde
 * empieza el codigo. En modulos y no en pixeles para que escale con el.
 */
export function caminoDe(matriz: MatrizQr, margen: number = MARGEN_EN_MODULOS): Camino {
  const { lado, modulos } = matriz;
  let d = '';
  for (let fila = 0; fila < lado; fila++) {
    for (let col = 0; col < lado; col++) {
      if (!modulos[fila * lado + col]) continue;
      d += `M${col + margen} ${fila + margen}h1v1h-1z`;
    }
  }
  return { d, lienzo: lado + margen * 2 };
}
