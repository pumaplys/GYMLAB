/**
 * El tipo de la ruta interna de `qrcode` que se usa para codificar.
 *
 * `@types/qrcode` solo describe la API publica, que en un telefono no sirve:
 * sus dibujantes necesitan `fs` y un canvas. Aqui se declara EXACTAMENTE lo
 * que se usa —nada mas— para que si la forma cambia lo diga el compilador.
 */
declare module 'qrcode/lib/core/qrcode.js' {
  interface ModulosDelQr {
    size: number;
    /** Un modulo por posicion, por filas. 1 = oscuro. */
    data: ArrayLike<number>;
  }
  interface CodigoQr {
    modules: ModulosDelQr;
    version: number;
  }
  const nucleo: {
    create(datos: string, opciones?: { errorCorrectionLevel?: string }): CodigoQr;
  };
  export default nucleo;
}
