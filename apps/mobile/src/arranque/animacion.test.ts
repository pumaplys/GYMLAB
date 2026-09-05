import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENTRADA, RESPIRACION, planDeAnimacion } from './animacion';

describe('la animacion de arranque es sobria', () => {
  it('la entrada es corta y el zoom, minimo', () => {
    expect(ENTRADA.duracion).toBeLessThanOrEqual(500);
    // Un 4 %: se nota que algo se asienta, no que algo salta.
    expect(ENTRADA.escalaFinal - ENTRADA.escalaInicial).toBeLessThanOrEqual(0.05);
    expect(ENTRADA.escalaInicial).toBeLessThan(ENTRADA.escalaFinal);
    expect(ENTRADA.opacidadInicial).toBe(0);
    expect(ENTRADA.opacidadFinal).toBe(1);
  });

  /*
   * Por debajo de dos segundos por medio ciclo deja de leerse como una
   * respiracion y empieza a parecer un latido, que es la estetica que se
   * descarto. Y por encima del 3 % ya no es "muy ligera".
   */
  it('la respiracion es lenta y de recorrido corto', () => {
    expect(RESPIRACION.duracion).toBeGreaterThanOrEqual(2000);
    expect(RESPIRACION.escalaMaxima - RESPIRACION.escalaMinima).toBeLessThanOrEqual(0.03);
    expect(RESPIRACION.escalaMinima).toBe(1);
  });
});

describe('con movimiento reducido no se mueve nada', () => {
  it('sin respiracion y sin zoom: solo el fundido', () => {
    const plan = planDeAnimacion(true);
    expect(plan.respira).toBe(false);
    expect(plan.escalaEnEntrada).toBe(false);
    // Entra ya a su tamaño: lo unico que cambia es la opacidad.
    expect(plan.escalaInicial).toBe(ENTRADA.escalaFinal);
  });

  it('sin el ajuste, la animacion completa', () => {
    const plan = planDeAnimacion(false);
    expect(plan.respira).toBe(true);
    expect(plan.escalaEnEntrada).toBe(true);
    expect(plan.escalaInicial).toBe(ENTRADA.escalaInicial);
  });

  it('el fundido se mantiene en los dos casos: aparecer no marea', () => {
    for (const reducido of [true, false]) {
      expect(planDeAnimacion(reducido).duracionDeEntrada).toBe(ENTRADA.duracion);
    }
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ANIMACION NO PUEDE DECIDIR CUANTO DURA EL ARRANQUE.                  │
 * │                                                                          │
 * │ El fallo tipico es querer que el logo "luzca": un `setTimeout` de dos    │
 * │ segundos, o esperar a que la animacion acabe antes de navegar. Eso le    │
 * │ roba tiempo a quien solo queria abrir la app.                            │
 * │                                                                          │
 * │ Se comprueba en el CODIGO de la pantalla, sin comentarios: uno de ellos  │
 * │ explica precisamente que no hay `setTimeout`, y esa explicacion es lo    │
 * │ que se quiere conservar.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('el arranque no se alarga a proposito', () => {
  const codigo = readFileSync(join(__dirname, '..', 'componentes', 'arranque.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  it('la pantalla de arranque no usa temporizadores', () => {
    expect(codigo).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
  });

  it('no espera a que la animacion termine para nada', () => {
    // `start(callback)` con un cuerpo seria justo eso: hacer algo AL ACABAR.
    expect(codigo).not.toMatch(/\.start\(\s*\(/);
    expect(codigo).toMatch(/\.start\(\)/);
  });

  it('para la animacion al desmontar', () => {
    expect(codigo).toMatch(/return \(\) => secuencia\.stop\(\)/);
  });

  it('la animacion corre en el hilo de la interfaz', () => {
    // Sin esto, cada fotograma pasa por el puente y compite con la peticion
    // de sesion, que es justo lo que se esta esperando.
    expect(codigo).not.toMatch(/useNativeDriver:\s*false/);
    expect(codigo.match(/useNativeDriver:\s*true/g) ?? []).toHaveLength(4);
  });
});
