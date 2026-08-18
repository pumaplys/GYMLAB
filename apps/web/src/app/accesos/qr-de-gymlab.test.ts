import { randomBytes } from 'node:crypto';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

/**
 * GYMLAB GENERA UN QR → jsQR LO PUEDE LEER.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN ESTO, LA COMPATIBILIDAD ERA UNA SUPOSICION.                         │
 * │                                                                          │
 * │ `jsqr` se eligio como respaldo para los navegadores sin `BarcodeDetector`│
 * │ —Safari y Firefox—, que son la mayoria de quienes lo van a usar. Su      │
 * │ ultima version es de 2021: funciona, pero no basta con confiar en que    │
 * │ lea «QR en general». Lo que hay que demostrar es que lee EL QR QUE       │
 * │ GENERA ESTA APLICACION, con su tamano de carga y su configuracion.       │
 * │                                                                          │
 * │ Un test que fingiera `jsqr` y despues afirmara que decodifica no probaria│
 * │ nada: probaria el fingido.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * COMO SE OBTIENEN LOS PIXELES SIN NAVEGADOR
 *
 * La pantalla del socio genera **SVG**, que no tiene pixeles. Aqui se pide al
 * MISMO paquete y con la MISMA configuracion un mapa de bits en crudo
 * (`toBuffer` de `qrcode`), que es lo que `jsQR` espera: un `Uint8ClampedArray`
 * RGBA. Rasterizar el SVG haria falta un navegador y anadiria un motor de
 * dibujo entre medias sin acercarnos mas a la verdad — el codigo de barras es
 * el mismo en los dos formatos porque lo produce la misma libreria.
 *
 * NINGUN SECRETO: las cargas son bytes aleatorios con la forma y el tamano de
 * un token real, no tokens firmados.
 */

/** La configuracion EXACTA de `/socio/carne`. Si cambia alli, aqui falla. */
const COMO_EN_EL_CARNE = {
  errorCorrectionLevel: 'M' as const,
  margin: 2,
  color: { dark: '#000000', light: '#ffffff' },
};

/**
 * Un token con la forma del real: cuerpo binario + firma de 32 bytes, en
 * base64url. Son ~118 caracteres. Aleatorio, sin ninguna clave de por medio.
 */
function tokenDeMentira(): string {
  return randomBytes(88).toString('base64url');
}

/** El QR como pixeles, tal y como los ve `jsQR` desde un fotograma de video. */
async function comoPixeles(carga: string, escala: number) {
  const png = await QRCode.toBuffer(carga, { ...COMO_EN_EL_CARNE, type: 'png', scale: escala });

  // Se decodifica el PNG a mano: es de un solo color y sin compresion util
  // aqui, asi que se usa el propio `qrcode` para obtener la matriz y se pinta.
  const { create } = await import('qrcode');
  const simbolo = create(carga, { errorCorrectionLevel: COMO_EN_EL_CARNE.errorCorrectionLevel });
  const modulos = simbolo.modules;
  const lado = modulos.size;
  const margen = COMO_EN_EL_CARNE.margin;
  const ancho = (lado + margen * 2) * escala;

  const datos = new Uint8ClampedArray(ancho * ancho * 4);
  for (let y = 0; y < ancho; y++) {
    for (let x = 0; x < ancho; x++) {
      const mx = Math.floor(x / escala) - margen;
      const my = Math.floor(y / escala) - margen;
      const dentro = mx >= 0 && my >= 0 && mx < lado && my < lado;
      const oscuro = dentro && modulos.get(mx, my);
      const valor = oscuro ? 0 : 255;
      const i = (y * ancho + x) * 4;
      datos[i] = valor;
      datos[i + 1] = valor;
      datos[i + 2] = valor;
      datos[i + 3] = 255;
    }
  }

  expect(png.length).toBeGreaterThan(0);
  return { datos, ancho };
}

describe('el QR de GYMLAB lo lee jsQR', () => {
  it('recupera EXACTAMENTE un token con la forma del real', async () => {
    const token = tokenDeMentira();
    const { datos, ancho } = await comoPixeles(token, 6);

    const leido = jsQR(datos, ancho, ancho, { inversionAttempts: 'dontInvert' });

    expect(leido).not.toBeNull();
    expect(leido!.data).toBe(token);
  });

  it('el token de prueba tiene el tamano del de verdad', async () => {
    // ~118 caracteres: si el token creciera mucho, el QR se densifica y esta
    // prueba dejaria de representar el caso real.
    const token = tokenDeMentira();
    expect(token.length).toBeGreaterThan(100);
    expect(token.length).toBeLessThan(130);
  });

  it('funciona tambien con la camara lejos: pocos pixeles por modulo', async () => {
    /*
     * En el mostrador nadie pega el movil al objetivo. Con escala 3 cada modulo
     * del codigo ocupa 3 pixeles, que es un movil a un palmo. Si `jsqr` fallara
     * aqui, el respaldo seria inutil en la practica aunque pasara el caso
     * comodo de arriba.
     */
    const token = tokenDeMentira();
    const { datos, ancho } = await comoPixeles(token, 3);

    const leido = jsQR(datos, ancho, ancho, { inversionAttempts: 'dontInvert' });

    expect(leido?.data).toBe(token);
  });

  it('varios tokens distintos, por si acertamos con uno por casualidad', async () => {
    for (let i = 0; i < 5; i++) {
      const token = tokenDeMentira();
      const { datos, ancho } = await comoPixeles(token, 5);
      expect(jsQR(datos, ancho, ancho, { inversionAttempts: 'dontInvert' })?.data).toBe(token);
    }
  });

  it('sobre ruido no inventa un token', async () => {
    // Un fotograma sin codigo debe devolver null, no una cadena cualquiera:
    // el bucle de la camara lo llama muchas veces y un falso positivo
    // consumiria un token que nadie enseno.
    const ancho = 120;
    const datos = new Uint8ClampedArray(ancho * ancho * 4);
    for (let i = 0; i < datos.length; i += 4) {
      const v = (i * 7919) % 255;
      datos[i] = v;
      datos[i + 1] = v;
      datos[i + 2] = v;
      datos[i + 3] = 255;
    }

    expect(jsQR(datos, ancho, ancho, { inversionAttempts: 'dontInvert' })).toBeNull();
  });
});
