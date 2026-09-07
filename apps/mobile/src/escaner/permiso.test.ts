import { describe, expect, it } from 'vitest';
import { estadoDelPermiso, puedePedirse } from './permiso';

describe('los cuatro estados del permiso de camara', () => {
  it('sin respuesta todavia, se esta consultando', () => {
    // El primer render llega con `null`: el sistema aun no ha contestado. Si
    // eso se tratara como "denegado", la pantalla enseñaria un error durante
    // una fraccion de segundo cada vez que se abre el escaner.
    expect(estadoDelPermiso(null)).toBe('consultando');
  });

  it('concedido es concedido', () => {
    expect(estadoDelPermiso({ granted: true, canAskAgain: false })).toBe('concedido');
    expect(estadoDelPermiso({ granted: true, canAskAgain: true })).toBe('concedido');
  });

  it('la primera negativa deja volver a preguntar', () => {
    expect(estadoDelPermiso({ granted: false, canAskAgain: true })).toBe('denegado');
  });

  it('cuando el sistema ya no preguntara mas, queda bloqueado', () => {
    expect(estadoDelPermiso({ granted: false, canAskAgain: false })).toBe('bloqueado');
  });
});

describe('cuando tiene sentido enseñar el boton de pedir permiso', () => {
  it('solo si el sistema va a volver a preguntar', () => {
    expect(puedePedirse('denegado')).toBe(true);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN BOTON QUE NO HACE NADA ES PEOR QUE NO TENER BOTON.                │
   * │                                                                      │
   * │ Con el permiso bloqueado, `requestPermissions` vuelve inmediatamente  │
   * │ sin enseñar ningun dialogo. Quien lo pulsa en el mostrador ve que no  │
   * │ pasa nada, lo pulsa otra vez, y acaba pensando que la app esta rota   │
   * │ cuando lo que hay que hacer es ir a los ajustes del telefono.         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('no se ofrece cuando ya no se puede preguntar', () => {
    expect(puedePedirse('bloqueado')).toBe(false);
  });

  it('ni mientras se consulta, ni con el permiso ya concedido', () => {
    expect(puedePedirse('consultando')).toBe(false);
    expect(puedePedirse('concedido')).toBe(false);
  });
});
