import { describe, expect, it } from 'vitest';
import { matrizDe } from './matriz';

/**
 * El QR se dibuja en el cliente, asi que su correccion es NUESTRA
 * responsabilidad. Estas pruebas no comprueban que el codigo sea "bonito":
 * comprueban que es un QR de verdad.
 */

/** La misma forma que el token real: 119 caracteres base64url. */
const TOKEN = 'a1B2c3D4e5F6g7H8i9J0-_kLmNoPqRsTuVwXyZ'.repeat(4).slice(0, 119);

describe('la matriz del codigo', () => {
  it('sale cuadrada y con tantos modulos como dice su lado', () => {
    const m = matrizDe(TOKEN);
    expect(m.modulos).toHaveLength(m.lado * m.lado);
  });

  it('el lado es uno de los tamaños validos de QR: 21 + 4n', () => {
    const m = matrizDe(TOKEN);
    expect((m.lado - 21) % 4).toBe(0);
    expect(m.lado).toBeGreaterThanOrEqual(21);
    expect(m.lado).toBeLessThanOrEqual(177);
  });

  it('lleva los tres patrones de posicion en sus esquinas', () => {
    // Un QR sin ellos no lo encuentra ningun escaner. Se comprueba el ojo de
    // 3x3 oscuro dentro del anillo, en las tres esquinas que lo llevan.
    const m = matrizDe(TOKEN);
    const en = (f: number, c: number) => m.modulos[f * m.lado + c];
    const esquinas: [number, number][] = [
      [0, 0],
      [0, m.lado - 7],
      [m.lado - 7, 0],
    ];
    for (const [f0, c0] of esquinas) {
      for (let f = 2; f < 5; f++) {
        for (let c = 2; c < 5; c++) expect(en(f0 + f, c0 + c)).toBe(true);
      }
      // Y el anillo blanco que lo separa del ojo.
      expect(en(f0 + 1, c0 + 1)).toBe(false);
    }
  });

  it('dos tokens distintos dan matrices distintas', () => {
    const a = matrizDe(TOKEN);
    const b = matrizDe(TOKEN.slice(0, 118) + 'X');
    expect(a.modulos.join('')).not.toBe(b.modulos.join(''));
  });

  it('el mismo token da siempre la misma matriz', () => {
    expect(matrizDe(TOKEN).modulos).toEqual(matrizDe(TOKEN).modulos);
  });

  it('un token vacio no produce un codigo en blanco: falla', () => {
    // Pintar un QR de un token vacio seria enseñar algo que no abre nada.
    expect(() => matrizDe('')).toThrow();
  });

  it('el nucleo de `qrcode` sigue donde se le importa', () => {
    // Se importa una ruta interna del paquete. Si una version la mueve, esto
    // salta aqui y no en el telefono de alguien delante de un torno.
    const m = matrizDe(TOKEN);
    expect(m.lado).toBeGreaterThan(0);
  });
});
