import { DUES_STATES, PAYMENT_CONCEPTS, PAYMENT_METHODS, PLAN_PERIODS } from '@gymlab/contracts';
import type { Plan } from '@gymlab/contracts';
import { registerPaymentSchema } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  ACCIONES_POR_ESTADO,
  CONCEPTOS,
  METODOS,
  NOMBRE_DEL_CONCEPTO,
  NOMBRE_DEL_METODO,
  NOMBRE_DEL_PERIODO,
  PERIODOS,
  aCentimos,
  accionesDeCuota,
  cobroAEnvio,
  lineaDePlan,
  ordenarPlanes,
  planesContratables,
  sePuedeDarDeAlta,
  sinAcciones,
  tieneSentidoArchivarPlan,
} from './logica';
import { importe } from '../perfil/logica';
/*
 * Las dos referencias del panel web, por ruta relativa y SOLO en el test. Lo
 * que se comprueba es que las dos implementaciones deciden lo mismo, y eso no
 * se puede comprobar mirando una sola.
 */
import { accionesDeCuota as accionesWeb } from '../../../web/src/app/socios/ficha/acciones-de-cuota';
import { aCentimos as aCentimosWeb } from '../../../web/src/lib/formato';

describe('que se puede hacer con una cuota, segun como este', () => {
  /*
   * Congelar una cuota vencida lo rechaza el servidor: «no quedan dias que
   * guardar». Ofrecerlo seria un boton que siempre falla.
   */
  it('vencida y en gracia NO se congelan', () => {
    expect(accionesDeCuota('VENCIDA').congelar).toBe(false);
    expect(accionesDeCuota('EN_GRACIA').congelar).toBe(false);
    // Pero si se pueden dar de baja: eso siempre se puede.
    expect(accionesDeCuota('VENCIDA').darDeBaja).toBe(true);
  });

  it('una congelada solo se reanuda o se da de baja', () => {
    expect(accionesDeCuota('PAUSADA')).toEqual({
      congelar: false,
      reanudar: true,
      darDeBaja: true,
    });
  });

  it('sin suscripcion no hay nada que hacer… salvo darla de alta', () => {
    expect(sinAcciones('SIN_SUSCRIPCION')).toBe(true);
    expect(sePuedeDarDeAlta('SIN_SUSCRIPCION')).toBe(true);
  });

  it('y con una cuota viva NO se ofrece dar de alta otra', () => {
    for (const estado of DUES_STATES.filter((e) => e !== 'SIN_SUSCRIPCION')) {
      expect(sePuedeDarDeAlta(estado), estado).toBe(false);
    }
  });

  /*
   * La tabla se escribe entera, sin `default`: un estado nuevo del contrato
   * tiene que pasar por aqui en vez de heredar en silencio las acciones de otro.
   */
  it('todos los estados del contrato tienen su fila', () => {
    expect(Object.keys(ACCIONES_POR_ESTADO).sort()).toEqual([...DUES_STATES].sort());
  });

  it('el movil y el panel ofrecen EXACTAMENTE las mismas acciones', () => {
    for (const estado of DUES_STATES) {
      expect(accionesDeCuota(estado), estado).toEqual(accionesWeb(estado));
    }
  });
});

describe('el dinero que se teclea en el mostrador', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ `Number('19.99') * 100` DA 1998.9999999999998.                       │
   * │                                                                      │
   * │ Redondear eso funciona casi siempre, que es la peor clase de error.   │
   * │ Aqui las dos mitades se suman como enteros y no hay coma flotante.    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('los importes con decimales no se desvian', () => {
    expect(aCentimos('19,99')).toBe(1999);
    expect(aCentimos('19.99')).toBe(1999);
    expect(aCentimos('0,07')).toBe(7);
    expect(aCentimos('1234,50')).toBe(123450);
  });

  it('sin decimales, y con uno solo', () => {
    expect(aCentimos('35')).toBe(3500);
    expect(aCentimos('35,5')).toBe(3550);
  });

  it('lo que no es un importe se rechaza, no se adivina', () => {
    for (const malo of ['', '  ', 'gratis', '-5', '19,999', '1.2.3', '19€', '1 000']) {
      expect(aCentimos(malo), malo).toBeNull();
    }
  });

  it('el movil y el panel convierten igual', () => {
    for (const texto of ['19,99', '19.99', '0', '0,07', '1234,50', '35', 'gratis', '', '-5']) {
      expect(aCentimos(texto), texto).toBe(aCentimosWeb(texto));
    }
  });
});

describe('registrar un cobro', () => {
  it('manda concepto, metodo e importe, y pasa el contrato', () => {
    const envio = cobroAEnvio('subscription', 'cash', 3500, '');
    expect(envio).toEqual({ concept: 'subscription', method: 'cash', amountCents: 3500 });
    expect(registerPaymentSchema.safeParse(envio).success).toBe(true);
  });

  /*
   * `paidOn` se omite a proposito: el servidor pone hoy en la zona horaria DEL
   * GIMNASIO. Mandar la fecha del telefono seria mandar la del huso de quien
   * cobra, que puede no ser el mismo dia.
   */
  it('no manda la fecha: la pone el servidor en el huso del gimnasio', () => {
    expect(cobroAEnvio('other', 'card', 100, '')).not.toHaveProperty('paidOn');
  });

  it('una nota vacia no viaja; una escrita si, recortada', () => {
    expect(cobroAEnvio('other', 'card', 100, '   ')).not.toHaveProperty('note');
    expect(cobroAEnvio('other', 'card', 100, '  Pago parcial ').note).toBe('Pago parcial');
  });
});

describe('como se llama cada cosa en castellano', () => {
  it('ningun metodo, concepto ni periodo se queda sin nombre', () => {
    expect(METODOS.sort()).toEqual([...PAYMENT_METHODS].sort());
    expect(CONCEPTOS.sort()).toEqual([...PAYMENT_CONCEPTS].sort());
    expect(PERIODOS.sort()).toEqual([...PLAN_PERIODS].sort());
    for (const m of PAYMENT_METHODS) expect(NOMBRE_DEL_METODO[m], m).toBeTruthy();
    for (const c of PAYMENT_CONCEPTS) expect(NOMBRE_DEL_CONCEPTO[c], c).toBeTruthy();
    for (const p of PLAN_PERIODS) expect(NOMBRE_DEL_PERIODO[p], p).toBeTruthy();
  });

  it('y ninguno enseña el valor crudo del contrato', () => {
    const todos = [
      ...Object.values(NOMBRE_DEL_METODO),
      ...Object.values(NOMBRE_DEL_CONCEPTO),
      ...Object.values(NOMBRE_DEL_PERIODO),
    ];
    for (const nombre of todos) expect(nombre).not.toMatch(/^[a-z_]+$/);
  });
});

const plan = (parcial: Partial<Plan>): Plan => ({
  id: 'p1',
  name: 'Mensual',
  description: null,
  priceCents: 3500,
  currency: 'EUR',
  period: 'monthly',
  status: 'active',
  activeSubscriptions: 0,
  ...parcial,
});

describe('los planes', () => {
  const TODOS = [
    plan({ id: 'a', name: 'Zeta' }),
    plan({ id: 'b', name: 'Alfa' }),
    plan({ id: 'c', name: 'Viejo', status: 'archived' }),
  ];

  /*
   * Un plan archivado sigue existiendo porque hay suscripciones que lo usan, y
   * el servidor rechaza contratarlo. Ofrecerlo seria ofrecer un error.
   */
  it('para contratar solo salen los activos, por nombre', () => {
    expect(planesContratables(TODOS).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('en la lista del dueño salen todos, con los archivados al final', () => {
    expect(ordenarPlanes(TODOS).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('la segunda linea dice precio, periodicidad y cuantos lo usan', () => {
    expect(lineaDePlan(plan({ activeSubscriptions: 4 }), importe)).toBe(
      '35,00 € · mensual · 4 suscripciones',
    );
    expect(lineaDePlan(plan({ activeSubscriptions: 1 }), importe)).toBe(
      '35,00 € · mensual · 1 suscripción',
    );
    expect(lineaDePlan(plan({ activeSubscriptions: 0 }), importe)).toBe(
      '35,00 € · mensual · sin suscripciones',
    );
  });

  it('uno archivado lo dice, en vez de contar suscripciones', () => {
    expect(lineaDePlan(plan({ status: 'archived', activeSubscriptions: 9 }), importe)).toBe(
      '35,00 € · mensual · archivado',
    );
  });

  it('archivar solo tiene sentido con uno activo', () => {
    expect(tieneSentidoArchivarPlan('active')).toBe(true);
    expect(tieneSentidoArchivarPlan('archived')).toBe(false);
  });
});
