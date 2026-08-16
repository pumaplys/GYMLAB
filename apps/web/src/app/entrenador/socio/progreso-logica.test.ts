import { recordBodyMetricSchema } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  aEnvio,
  aNumero,
  borradorVacio,
  erroresDe,
  estadoDe,
  type Borrador,
} from './progreso-logica';

/**
 * DATOS DE SALUD: LO QUE SE MANDA Y CUANDO SE PUEDE MANDAR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE ESTAS PRUEBAS NO SON.                                             │
 * │                                                                          │
 * │ No comprueban que el consentimiento se respete: eso lo sostiene el 403   │
 * │ del servidor y se prueba contra la API. Lo de aqui es que la pantalla    │
 * │ REPRESENTE bien los tres estados y que un 72,4 escrito a mano llegue     │
 * │ como 72.4 y no como NaN.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const con = (medidas: Partial<Borrador['medidas']>, resto: Partial<Borrador> = {}): Borrador => ({
  ...borradorVacio(),
  ...resto,
  medidas: { ...borradorVacio().medidas, ...medidas },
});

describe('en que estado esta el consentimiento', () => {
  it('sin texto legal configurado, no es que el socio no haya aceptado', () => {
    // Son dos situaciones distintas y las arregla gente distinta: esta la
    // resuelve quien gestiona el gimnasio, no el socio.
    expect(estadoDe({ currentVersion: null, accepted: false, acceptedAt: null })).toBe('sin-texto');
  });

  it('con texto vigente y sin aceptar', () => {
    expect(estadoDe({ currentVersion: '2026-09-01', accepted: false, acceptedAt: null })).toBe(
      'sin-aceptar',
    );
  });

  it('aceptado y vigente', () => {
    expect(
      estadoDe({
        currentVersion: '2026-09-01',
        accepted: true,
        acceptedAt: '2026-08-01T10:00:00.000Z',
      }),
    ).toBe('vigente');
  });

  it('si el backend dijera aceptado sin version, no se da por bueno', () => {
    // No deberia ocurrir, pero el orden de las comprobaciones importa: primero
    // se mira si hay texto. Sin el, el servidor rechazaria la escritura igual.
    expect(estadoDe({ currentVersion: null, accepted: true, acceptedAt: null })).toBe('sin-texto');
  });
});

describe('convertir lo tecleado en numero', () => {
  it('acepta la coma decimal, que es como se escribe aqui', () => {
    // `Number('72,4')` es NaN. Sin esto, el peso escrito de la forma natural
    // seria rechazado — y la base guarda decimales exactos justamente para no
    // perderlos.
    expect(aNumero('72,4')).toBe(72.4);
    expect(aNumero('72.4')).toBe(72.4);
  });

  it('vacio es "no se midio", no cero', () => {
    // Cero seria un dato falso: un perimetro de 0 cm no existe.
    expect(aNumero('')).toBeUndefined();
    expect(aNumero('   ')).toBeUndefined();
  });

  it('lo que no es numero sale como NaN para que la validacion lo vea', () => {
    expect(Number.isNaN(aNumero('mucho') as number)).toBe(true);
  });
});

describe('lo que se envia', () => {
  it('solo van las medidas rellenas', () => {
    const envio = aEnvio(con({ weightKg: '72,4' }));
    expect(envio).toEqual({ weightKg: 72.4 });
    expect(recordBodyMetricSchema.safeParse(envio).success).toBe(true);
  });

  it('varias medidas a la vez', () => {
    const envio = aEnvio(con({ weightKg: '80', waistCm: '92,5', armCm: '38' }));
    expect(envio).toEqual({ weightKg: 80, waistCm: 92.5, armCm: 38 });
    expect(recordBodyMetricSchema.safeParse(envio).success).toBe(true);
  });

  it('sin fecha no se manda `measuredAt`: el servidor pone la de ahora', () => {
    expect(aEnvio(con({ weightKg: '70' }))).not.toHaveProperty('measuredAt');
  });

  it('la fecha viaja como ISO y al mediodia, no a medianoche', () => {
    // A las 00:00 locales, un huso por delante de UTC convierte la fecha en el
    // dia anterior y la medicion de hoy apareceria fechada ayer.
    const envio = aEnvio(con({ weightKg: '70' }, { fecha: '2026-08-10' }));
    const cuando = new Date(envio.measuredAt as string);
    expect(cuando.getFullYear()).toBe(2026);
    expect(cuando.getMonth()).toBe(7);
    expect(cuando.getDate()).toBe(10);
  });

  it('las notas en blanco no se mandan', () => {
    expect(aEnvio(con({ weightKg: '70' }, { notas: '   ' }))).not.toHaveProperty('notes');
  });

  it('las notas se recortan', () => {
    expect(aEnvio(con({ weightKg: '70' }, { notas: '  Venia en ayunas  ' })).notes).toBe(
      'Venia en ayunas',
    );
  });
});

describe('validacion, con el mismo esquema que aplica el servidor', () => {
  it('un formulario vacio no se puede guardar', () => {
    // "Al menos una medida": un registro sin ninguna no es un dato, es ruido.
    expect(erroresDe(borradorVacio()).general).toBeDefined();
  });

  it('ni uno donde solo hay notas', () => {
    expect(erroresDe(con({}, { notas: 'Solo una nota' })).general).toBeDefined();
  });

  it('un peso que no es numero se senala en SU campo', () => {
    const errores = erroresDe(con({ weightKg: 'mucho' }));
    expect(errores.weightKg).toBe('Escribe un numero.');
  });

  it('un peso fuera de rango se senala en su campo', () => {
    expect(erroresDe(con({ weightKg: '900' })).weightKg).toContain('fuera de rango');
    expect(erroresDe(con({ bodyFatPercent: '95' })).bodyFatPercent).toContain('fuera de rango');
  });

  it('el cero no cuela como medida', () => {
    // El esquema las quiere positivas: un peso de 0 kg no es una medicion.
    expect(erroresDe(con({ weightKg: '0' })).weightKg).toBeDefined();
  });

  it('una fecha futura se rechaza', () => {
    const manana = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(erroresDe(con({ weightKg: '70' }, { fecha: manana })).fecha).toContain('futuro');
  });

  it('una fecha pasada se acepta: se apunta el lunes lo del sabado', () => {
    expect(erroresDe(con({ weightKg: '70' }, { fecha: '2026-01-15' }))).toEqual({});
  });

  it('notas demasiado largas se senalan', () => {
    expect(erroresDe(con({ weightKg: '70' }, { notas: 'x'.repeat(501) })).notas).toBeDefined();
  });

  it('un formulario correcto no tiene errores', () => {
    expect(erroresDe(con({ weightKg: '72,4', waistCm: '90' }, { notas: 'Bien' }))).toEqual({});
  });
});
