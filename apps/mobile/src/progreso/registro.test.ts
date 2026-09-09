import { describe, expect, it } from 'vitest';
import type { HealthConsentStatus } from '@gymlab/contracts';
import { recordBodyMetricSchema } from '@gymlab/contracts';
import { MEDIDAS } from './logica';
import {
  aEnvio,
  aNumero,
  borradorVacio,
  erroresDe,
  estadoDelConsentimiento,
  fechaValida,
  sePuedeRegistrar,
  type Borrador,
} from './registro';

const VIGENTE: HealthConsentStatus = {
  currentVersion: '2026-09-01',
  accepted: true,
  acceptedAt: '2026-05-02T09:30:00.000Z',
  document: null,
};

const con = (medidas: Partial<Borrador['medidas']>, resto: Partial<Borrador> = {}): Borrador => ({
  ...borradorVacio(),
  ...resto,
  medidas: { ...borradorVacio().medidas, ...medidas },
});

describe('el consentimiento manda, y se distingue quién lo arregla', () => {
  it('sin texto publicado no lo resuelve el socio', () => {
    expect(estadoDelConsentimiento({ ...VIGENTE, currentVersion: null, accepted: false })).toBe(
      'sin-texto',
    );
  });

  it('con texto y sin aceptar, lo resuelve el socio', () => {
    expect(estadoDelConsentimiento({ ...VIGENTE, accepted: false })).toBe('sin-aceptar');
  });

  it('aceptado es vigente', () => {
    expect(estadoDelConsentimiento(VIGENTE)).toBe('vigente');
  });

  it('«sin texto» gana sobre «aceptado»: sin version no hay nada que aceptar', () => {
    // Si el gimnasio pierde el texto, un `accepted` viejo no revive el permiso.
    expect(estadoDelConsentimiento({ ...VIGENTE, currentVersion: null })).toBe('sin-texto');
  });

  it('solo se ofrece el formulario con consentimiento vigente', () => {
    expect(sePuedeRegistrar(VIGENTE)).toBe(true);
    expect(sePuedeRegistrar({ ...VIGENTE, accepted: false })).toBe(false);
    expect(sePuedeRegistrar({ ...VIGENTE, currentVersion: null })).toBe(false);
    // `null` es «no se pudo consultar»: ante la duda, no se ofrece.
    expect(sePuedeRegistrar(null)).toBe(false);
  });
});

describe('lo tecleado se convierte en lo que pide el contrato', () => {
  it('acepta la coma decimal, que es como se escribe aquí', () => {
    expect(aNumero('72,4')).toBe(72.4);
    expect(aNumero('72.4')).toBe(72.4);
    expect(aNumero('  81  ')).toBe(81);
  });

  it('vacío es «no lo midieron», no cero', () => {
    // Un cero es un dato; un campo en blanco es la ausencia de dato. Mandar 0
    // registraria que alguien pesa cero kilos.
    expect(aNumero('')).toBeUndefined();
    expect(aNumero('   ')).toBeUndefined();
  });

  it('lo que no es un número se señala, no se manda', () => {
    expect(Number.isNaN(aNumero('mucho'))).toBe(true);
  });

  it('solo viajan las medidas escritas', () => {
    expect(aEnvio(con({ weightKg: '72,4' }))).toEqual({ weightKg: 72.4 });
  });

  it('la fecha viaja al mediodía, no a medianoche', () => {
    /*
     * A las 00:00 locales, un huso por delante de UTC convierte la fecha en el
     * dia anterior: una medicion de hoy apareceria fechada ayer.
     */
    const envio = aEnvio(con({ weightKg: '70' }, { fecha: '2026-09-08' }));
    const instante = new Date(envio.measuredAt as string);
    expect(instante.getFullYear()).toBe(2026);
    expect(instante.getMonth()).toBe(8);
    expect(instante.getDate()).toBe(8);
  });

  it('las notas viajan recortadas, y en blanco no viajan', () => {
    expect(aEnvio(con({ weightKg: '70' }, { notas: '  buena sesión  ' })).notes).toBe(
      'buena sesión',
    );
    expect(aEnvio(con({ weightKg: '70' }, { notas: '   ' }))).not.toHaveProperty('notes');
  });

  it('lo que sale de aquí lo acepta el esquema del servidor', () => {
    const envio = aEnvio(con({ weightKg: '72,4', waistCm: '80' }, { notas: 'ok' }));
    expect(recordBodyMetricSchema.safeParse(envio).success).toBe(true);
  });
});

describe('una fecha mal escrita no tumba el formulario', () => {
  /*
   * En la web la fecha sale de un `<input type="date">` y nunca llega basura.
   * Aqui es un campo de texto: `new Date('ayer').toISOString()` LANZA, y sin
   * cuidado el formulario entero se caeria en vez de señalar el campo.
   */
  it('aEnvio no revienta con texto que no es una fecha', () => {
    expect(() => aEnvio(con({ weightKg: '70' }, { fecha: 'ayer' }))).not.toThrow();
  });

  it('y esa fecha NO viaja: guardarla como hoy en silencio sería peor', () => {
    expect(aEnvio(con({ weightKg: '70' }, { fecha: 'ayer' }))).not.toHaveProperty('measuredAt');
  });

  it('se señala el campo', () => {
    expect(erroresDe(con({ weightKg: '70' }, { fecha: 'ayer' })).fecha).toBeTruthy();
    expect(erroresDe(con({ weightKg: '70' }, { fecha: '2026-13-40' })).fecha).toBeTruthy();
  });

  it('en blanco es válido: se guarda con la fecha de hoy', () => {
    expect(fechaValida('')).toBe(true);
    expect(erroresDe(con({ weightKg: '70' })).fecha).toBeUndefined();
  });
});

describe('los errores dicen qué arreglar', () => {
  it('sin ninguna medida no hay nada que registrar', () => {
    expect(erroresDe(borradorVacio()).general).toBe('Hay que registrar al menos una medida.');
  });

  it('una medida bien escrita no da errores', () => {
    expect(erroresDe(con({ weightKg: '72,4' }))).toEqual({});
  });

  it('el futuro se rechaza, el pasado no', () => {
    const manana = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
    expect(erroresDe(con({ weightKg: '70' }, { fecha: manana })).fecha).toBe(
      'La fecha no puede estar en el futuro.',
    );
    expect(erroresDe(con({ weightKg: '70' }, { fecha: '2020-01-01' })).fecha).toBeUndefined();
  });

  it('distingue «no es un número» de «fuera de rango»', () => {
    expect(erroresDe(con({ weightKg: 'mucho' })).weightKg).toBe('Escribe un número.');
    expect(erroresDe(con({ weightKg: '900' })).weightKg).toContain('fuera de rango');
  });

  it('las notas largas se señalan en su campo', () => {
    expect(erroresDe(con({ weightKg: '70' }, { notas: 'x'.repeat(501) })).notas).toContain('500');
  });

  it('los rangos NO se reescriben aquí: los pone el contrato', () => {
    /*
     * Si el servidor cambiara el maximo de peso, esto tiene que cambiar solo.
     * Un limite copiado a mano seria una segunda fuente de verdad sobre lo que
     * puede pesar una persona.
     */
    const limite = recordBodyMetricSchema.safeParse({ weightKg: 900 });
    expect(limite.success).toBe(false);
    expect(erroresDe(con({ weightKg: '900' })).weightKg).toBeTruthy();
  });
});

describe('el formulario cubre las siete medidas del contrato', () => {
  it('ni una más ni una menos', () => {
    const delContrato = Object.keys(recordBodyMetricSchema.def.shape).filter(
      (k) => k !== 'measuredAt' && k !== 'notes',
    );
    const enPantalla = MEDIDAS.map((m) => m.campo);
    // Si el contrato añadiera una medida, el formulario se quedaria corto sin
    // que nada fallara: se podria medir algo que no hay donde escribir.
    expect([...enPantalla].sort()).toEqual([...delContrato].sort());
  });
});
