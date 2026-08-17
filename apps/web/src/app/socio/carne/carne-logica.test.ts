import { describe, expect, it } from 'vitest';
import { estaCaducado, segundosRestantes, textoDeCuentaAtras } from './carne-logica';

/**
 * LA CADUCIDAD DEL QR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE CUENTA CONTRA LA HORA DEL SERVIDOR, NO CONTRA UN CONTADOR LOCAL.     │
 * │                                                                          │
 * │ El token dura sesenta segundos y el servidor dice a que hora exacta      │
 * │ caduca. Si se restara de un contador propio, un movil con el reloj       │
 * │ adelantado ensenaria como valido un codigo que la puerta ya rechaza — o  │
 * │ al reves, tacharia uno que todavia servia.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const enSegundos = (n: number) => new Date(Date.now() + n * 1000).toISOString();

describe('cuanto le queda al codigo', () => {
  it('cuenta los segundos que faltan', () => {
    expect(segundosRestantes(enSegundos(45))).toBeGreaterThan(43);
    expect(segundosRestantes(enSegundos(45))).toBeLessThanOrEqual(45);
  });

  it('un codigo pasado son cero segundos, nunca negativos', () => {
    // "Caduca en -12 segundos" no lo dice nadie, y ademas invitaria a pintar
    // una cuenta atras que sigue corriendo hacia abajo.
    expect(segundosRestantes(enSegundos(-12))).toBe(0);
  });

  it('justo al vencer ya esta caducado', () => {
    expect(estaCaducado(enSegundos(0))).toBe(true);
    expect(estaCaducado(enSegundos(1))).toBe(false);
  });

  it('se puede fijar el ahora, que es como se prueba sin esperar un minuto', () => {
    const caduca = new Date('2026-08-16T10:00:00.000Z').toISOString();
    expect(segundosRestantes(caduca, new Date('2026-08-16T09:59:30Z').getTime())).toBe(30);
    expect(estaCaducado(caduca, new Date('2026-08-16T10:00:01Z').getTime())).toBe(true);
  });
});

describe('lo que se anuncia', () => {
  it('el QR no puede ser la unica informacion', () => {
    // Quien no ve la pantalla necesita saber si su codigo sigue valiendo.
    expect(textoDeCuentaAtras(45)).toContain('45');
    expect(textoDeCuentaAtras(45)).toMatch(/caduca/i);
  });

  it('en singular cuando queda uno', () => {
    expect(textoDeCuentaAtras(1)).toBe('El codigo caduca en 1 segundo.');
  });

  it('caducado lo dice y dice que hacer', () => {
    const texto = textoDeCuentaAtras(0);
    expect(texto).toMatch(/caducado/i);
    expect(texto).toMatch(/genera/i);
  });
});
