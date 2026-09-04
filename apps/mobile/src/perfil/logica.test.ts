import { describe, expect, it } from 'vitest';
import type { HealthConsentStatus, Member, OwnAccessEvent, OwnPayment } from '@gymlab/contracts';
import {
  accionesDePrivacidad,
  acumular,
  conceptoDePago,
  cuantosQuedan,
  estadoDePago,
  identidadDe,
  importe,
  lecturaDeAcceso,
  lecturaDeImporte,
  metodoDePago,
  quedanMas,
  situacionDePrivacidad,
  type Acumulado,
} from './logica';

function ficha(parcial: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    memberNumber: 128,
    firstName: 'Lucia',
    lastName: 'Fernandez',
    email: null,
    phone: null,
    birthDate: null,
    status: 'active',
    joinedAt: '2026-01-10T09:00:00.000Z',
    leftAt: null,
    hasAccount: true,
    ...parcial,
  } as Member;
}

function pago(parcial: Partial<OwnPayment> = {}): OwnPayment {
  return {
    id: 'p1',
    concept: 'subscription',
    amountCents: 3500,
    currency: 'EUR',
    method: 'cash',
    paidOn: '2026-08-20',
    voidedAt: null,
    voidReason: null,
    ...parcial,
  } as OwnPayment;
}

function acceso(parcial: Partial<OwnAccessEvent> = {}): OwnAccessEvent {
  return {
    decision: 'ALLOW',
    reason: 'OK',
    isRetry: false,
    occurredAt: '2026-09-03T18:42:00.000Z',
    ...parcial,
  } as OwnAccessEvent;
}

describe('la identidad', () => {
  it('nombre completo, numero de socio e inicial', () => {
    const i = identidadDe(ficha());
    expect(i.nombre).toBe('Lucia Fernandez');
    expect(i.numero).toBe('Socio n.º 128');
    expect(i.inicial).toBe('L');
  });

  it('no se rompe con un nombre raro', () => {
    expect(identidadDe(ficha({ firstName: '', lastName: 'Solo' })).inicial).toBe('?');
    expect(identidadDe(ficha({ firstName: 'ana', lastName: '' })).nombre).toBe('ana');
    expect(identidadDe(ficha({ firstName: 'ana' })).inicial).toBe('A');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PRUEBA QUE IMPIDE MULTIPLICAR CADA CUOTA POR CIEN.                   │
 * │                                                                          │
 * │ `amountCents` es un entero de CENTIMOS. Si alguien lo pinta tal cual,    │
 * │ 3500 se leeria como tres mil quinientos euros.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('los importes', () => {
  it('los centimos son centimos', () => {
    expect(importe(3500, 'EUR')).toBe('35,00 €');
    expect(importe(1500, 'EUR')).toBe('15,00 €');
    expect(importe(3990, 'EUR')).toBe('39,90 €');
  });

  it('nunca se enseña el numero de centimos crudo', () => {
    expect(importe(3500, 'EUR')).not.toContain('3500');
    expect(importe(129900, 'EUR')).not.toContain('129900');
  });

  it('los millares llevan punto y los decimales coma', () => {
    expect(importe(129900, 'EUR')).toBe('1.299,00 €');
    expect(importe(100000000, 'EUR')).toBe('1.000.000,00 €');
  });

  it('un solo centimo se escribe con sus dos decimales', () => {
    expect(importe(1, 'EUR')).toBe('0,01 €');
    expect(importe(0, 'EUR')).toBe('0,00 €');
    expect(importe(10, 'EUR')).toBe('0,10 €');
  });

  it('una moneda que no conocemos se enseña con su codigo, sin inventar simbolo', () => {
    expect(importe(3500, 'USD')).toBe('35,00 USD');
    expect(importe(3500, 'GBP')).toBe('35,00 GBP');
  });

  it('el lector oye la moneda en palabras, no un simbolo', () => {
    expect(lecturaDeImporte(3500, 'EUR')).toBe('35 euros');
    expect(lecturaDeImporte(3990, 'EUR')).toBe('39 con 90 euros');
    expect(lecturaDeImporte(1500, 'EUR')).toBe('15 euros');
    expect(lecturaDeImporte(3500, 'USD')).toBe('35 USD');
  });
});

describe('los pagos', () => {
  it('los tres conceptos y los cuatro metodos del contrato', () => {
    expect(conceptoDePago(pago({ concept: 'subscription' }))).toBe('Cuota');
    expect(conceptoDePago(pago({ concept: 'enrolment' }))).toBe('Matrícula');
    expect(conceptoDePago(pago({ concept: 'other' }))).toBe('Otro concepto');
    expect(metodoDePago(pago({ method: 'cash' }))).toBe('Efectivo');
    expect(metodoDePago(pago({ method: 'card' }))).toBe('Tarjeta');
    expect(metodoDePago(pago({ method: 'transfer' }))).toBe('Transferencia');
    expect(metodoDePago(pago({ method: 'other' }))).toBe('Otro método');
  });

  it('un pago vigente no esta anulado', () => {
    expect(estadoDePago(pago())).toEqual({ anulado: false });
  });

  it('un pago anulado trae cuando y por que', () => {
    const estado = estadoDePago(
      pago({ voidedAt: '2026-05-22T10:15:00.000Z', voidReason: 'Cobro duplicado' }),
    );
    expect(estado).toEqual({
      anulado: true,
      iso: '2026-05-22T10:15:00.000Z',
      motivo: 'Cobro duplicado',
    });
  });

  it('un pago anulado SIN motivo sigue siendo un pago anulado', () => {
    const estado = estadoDePago(pago({ voidedAt: '2026-05-22T10:15:00.000Z', voidReason: null }));
    if (!estado.anulado) throw new Error('deberia estar anulado');
    expect(estado.motivo).toBeNull();
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EN ACCESOS NO HAY PUERTA, Y NO SE INVENTA.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('los accesos', () => {
  it('las tres decisiones se dicen con PALABRAS', () => {
    expect(lecturaDeAcceso(acceso({ decision: 'ALLOW' })).titulo).toBe('Entrada');
    expect(lecturaDeAcceso(acceso({ decision: 'WARN', reason: 'DUES_WARN' })).titulo).toBe(
      'Entrada con aviso',
    );
    expect(lecturaDeAcceso(acceso({ decision: 'DENY', reason: 'DUES_EXPIRED' })).titulo).toBe(
      'Entrada denegada',
    );
  });

  it('el tono acompaña, pero el titulo se entiende sin ver el color', () => {
    for (const decision of ['ALLOW', 'WARN', 'DENY'] as const) {
      const lectura = lecturaDeAcceso(acceso({ decision }));
      expect(lectura.titulo.length).toBeGreaterThan(4);
      expect(['exito', 'aviso', 'peligro']).toContain(lectura.tono);
    }
  });

  it('cada motivo del contrato tiene su frase', () => {
    const motivos = [
      'OK',
      'DUES_WARN',
      'DUES_EXPIRED',
      'NO_SUBSCRIPTION',
      'MEMBER_INACTIVE',
      'TOKEN_REUSED',
      'TOKEN_EXPIRED',
      'BAD_SIGNATURE',
      'UNKNOWN_MEMBER',
    ] as const;
    for (const reason of motivos) {
      const detalle = lecturaDeAcceso(acceso({ reason })).detalle;
      expect(detalle, reason).toBeTruthy();
      // Ni siglas ni MAYUSCULAS_CON_GUION: eso es del servidor, no del socio.
      expect(detalle, reason).not.toMatch(/_/);
    }
  });

  it('NUNCA se menciona una puerta, un torno ni un lector concreto', () => {
    const inventadas = /puerta|torno|molinete|acceso principal|entrada principal|sede|dispositivo/i;
    for (const decision of ['ALLOW', 'WARN', 'DENY'] as const) {
      const lectura = lecturaDeAcceso(acceso({ decision }));
      expect(lectura.titulo).not.toMatch(inventadas);
      expect(lectura.detalle).not.toMatch(inventadas);
    }
  });

  it('el reintento se distingue de una entrada nueva', () => {
    expect(lecturaDeAcceso(acceso({ isRetry: true })).esReintento).toBe(true);
    expect(lecturaDeAcceso(acceso({ isRetry: false })).esReintento).toBe(false);
  });
});

describe('la privacidad', () => {
  const doc = {
    id: 'd1',
    version: '2026-09-01',
    title: 'Tratamiento de datos de salud',
    body: 'Texto largo.',
    controller: 'Gimnasio S.L.',
    publishedAt: '2026-09-01T08:00:00.000Z',
  };

  const estado = (parcial: Partial<HealthConsentStatus>): HealthConsentStatus =>
    ({ currentVersion: '2026-09-01', accepted: false, acceptedAt: null, document: doc, ...parcial }) as HealthConsentStatus;

  it('sin documento publicado, no hay nada que aceptar', () => {
    const situacion = situacionDePrivacidad(
      estado({ document: null, currentVersion: null }),
    );
    expect(situacion.tipo).toBe('sinTexto');
    expect(accionesDePrivacidad(situacion)).toEqual({ puedeAceptar: false, puedeRetirar: false });
  });

  /*
   * Un consentimiento del articulo 9 tiene que ser INFORMADO: si no hay texto
   * que leer, ofrecer el boton seria pedir un clic, no un permiso. Y el
   * servidor lo rechazaria igual.
   */
  it('sin documento NO se ofrece aceptar aunque haya version vigente', () => {
    const situacion = situacionDePrivacidad(estado({ document: null }));
    expect(accionesDePrivacidad(situacion).puedeAceptar).toBe(false);
  });

  it('con documento y sin aceptar: pendiente, y solo se puede aceptar', () => {
    const situacion = situacionDePrivacidad(estado({ accepted: false }));
    expect(situacion.tipo).toBe('pendiente');
    expect(accionesDePrivacidad(situacion)).toEqual({ puedeAceptar: true, puedeRetirar: false });
  });

  it('aceptado: vigente, y solo se puede retirar', () => {
    const situacion = situacionDePrivacidad(
      estado({ accepted: true, acceptedAt: '2026-09-02T17:30:00.000Z' }),
    );
    expect(situacion.tipo).toBe('vigente');
    expect(accionesDePrivacidad(situacion)).toEqual({ puedeAceptar: false, puedeRetirar: true });
    if (situacion.tipo !== 'vigente') return;
    expect(situacion.aceptadoEn).toBe('2026-09-02T17:30:00.000Z');
  });

  it('el texto y el responsable viajan enteros: sin ellos no hay consentimiento informado', () => {
    const situacion = situacionDePrivacidad(estado({}));
    if (situacion.tipo === 'sinTexto') throw new Error('deberia haber documento');
    expect(situacion.texto).toBe('Texto largo.');
    expect(situacion.responsable).toBe('Gimnasio S.L.');
    expect(situacion.version).toBe('2026-09-01');
  });

  it('no existe ninguna accion mas que aceptar y retirar', () => {
    const claves = Object.keys(accionesDePrivacidad(situacionDePrivacidad(estado({}))));
    expect(claves.sort()).toEqual(['puedeAceptar', 'puedeRetirar']);
  });
});

describe('las listas paginadas', () => {
  const pagina = (page: number, cuantos: number, total: number) => ({
    items: Array.from({ length: cuantos }, (_, i) => `p${page}-${i}`),
    total,
    page,
  });

  it('la primera pagina empieza la lista', () => {
    const a = acumular(null, pagina(1, 50, 120));
    expect(a.elementos).toHaveLength(50);
    expect(a.total).toBe(120);
    expect(a.pagina).toBe(1);
  });

  it('la siguiente se añade al final, sin perder la anterior', () => {
    const a = acumular(null, pagina(1, 50, 120));
    const b = acumular(a, pagina(2, 50, 120));
    expect(b.elementos).toHaveLength(100);
    expect(b.elementos[0]).toBe('p1-0');
    expect(b.elementos[50]).toBe('p2-0');
  });

  it('una pagina que ya se tenia NO se duplica: reemplaza', () => {
    // Puede llegar dos veces si se refresca mientras carga.
    const a = acumular(null, pagina(1, 50, 120));
    const b = acumular(a, pagina(1, 50, 120));
    expect(b.elementos).toHaveLength(50);
    expect(b.pagina).toBe(1);
  });

  it('sabe cuantas quedan, y no dice que quedan cuando no quedan', () => {
    const a: Acumulado<string> = { elementos: ['x', 'y'], total: 2, pagina: 1 };
    expect(quedanMas(a)).toBe(false);
    expect(cuantosQuedan(a)).toBe(0);

    const b: Acumulado<string> = { elementos: ['x'], total: 12, pagina: 1 };
    expect(quedanMas(b)).toBe(true);
    expect(cuantosQuedan(b)).toBe(11);
  });

  it('con la lista vacia no quedan mas', () => {
    const a = acumular(null, pagina(1, 0, 0));
    expect(quedanMas(a)).toBe(false);
    expect(cuantosQuedan(a)).toBe(0);
  });

  it('nunca dice que quedan un numero negativo', () => {
    const raro: Acumulado<string> = { elementos: ['a', 'b', 'c'], total: 1, pagina: 1 };
    expect(cuantosQuedan(raro)).toBe(0);
  });
});
