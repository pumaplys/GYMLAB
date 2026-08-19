import { DUES_STATES } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  ACCIONES_POR_ESTADO,
  ETIQUETA_DE_BAJA,
  accionesDeCuota,
  sinAcciones,
} from './acciones-de-cuota';

describe('que se puede hacer con cada estado de cuota', () => {
  it('los SEIS estados del contrato estan cubiertos', () => {
    // Si el contrato gana un estado, esto falla hasta que alguien decida que
    // acciones tiene. Sin ello heredaria las de un `default` en silencio.
    expect(Object.keys(ACCIONES_POR_ESTADO)).toHaveLength(DUES_STATES.length);
    for (const estado of DUES_STATES) {
      expect(ACCIONES_POR_ESTADO[estado], estado).toBeDefined();
    }
  });

  it('con la cuota al dia se puede congelar y dar de baja, no reanudar', () => {
    for (const estado of ['AL_CORRIENTE', 'POR_VENCER'] as const) {
      expect(accionesDeCuota(estado)).toEqual({
        congelar: true,
        reanudar: false,
        darDeBaja: true,
      });
    }
  });

  it('congelada solo se reanuda o se da de baja', () => {
    expect(accionesDeCuota('PAUSADA')).toEqual({
      congelar: false,
      reanudar: true,
      darDeBaja: true,
    });
  });

  it('vencida NO ofrece congelar: el servidor lo rechaza', () => {
    /*
     * «No se puede congelar una cuota vencida: no quedan dias que guardar».
     * Ofrecer un boton que siempre falla es peor que no tenerlo.
     */
    for (const estado of ['EN_GRACIA', 'VENCIDA'] as const) {
      expect(accionesDeCuota(estado).congelar).toBe(false);
      expect(accionesDeCuota(estado).darDeBaja).toBe(true);
    }
  });

  it('sin cuota no hay ninguna accion', () => {
    expect(sinAcciones('SIN_SUSCRIPCION')).toBe(true);
    expect(accionesDeCuota('SIN_SUSCRIPCION')).toEqual({
      congelar: false,
      reanudar: false,
      darDeBaja: false,
    });
  });

  it('congelar y reanudar NUNCA se ofrecen a la vez', () => {
    // Son opuestos: si aparecieran juntos, uno de los dos fallaria seguro.
    for (const estado of DUES_STATES) {
      const acciones = accionesDeCuota(estado);
      expect(acciones.congelar && acciones.reanudar, estado).toBe(false);
    }
  });

  it('todo estado con cuota permite darla de baja', () => {
    // Es la salida que siempre tiene que existir: quien se va, se va.
    for (const estado of DUES_STATES) {
      if (estado === 'SIN_SUSCRIPCION') continue;
      expect(accionesDeCuota(estado).darDeBaja, estado).toBe(true);
    }
  });
});

describe('la etiqueta de dar de baja', () => {
  it('dice EXPLICITAMENTE que se da de baja la cuota', () => {
    /*
     * La cabecera de la ficha ya tiene un «Dar de baja» que da de baja al
     * SOCIO. Se detecto probando en navegador: dos botones destructivos con la
     * misma etiqueta en la misma pantalla, y significando cosas distintas.
     *
     * Acortarla «para que quepa» devolveria esa ambiguedad, asi que se vigila.
     */
    expect(ETIQUETA_DE_BAJA).toBe('Dar de baja la cuota');
  });

  it('no se queda en el texto ambiguo a secas', () => {
    expect(ETIQUETA_DE_BAJA).not.toBe('Dar de baja');
    expect(ETIQUETA_DE_BAJA.toLowerCase()).toContain('cuota');
  });
});
