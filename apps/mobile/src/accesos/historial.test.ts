import type { AccessEvent } from '@gymlab/contracts';
import { ACCESS_REASONS } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import { POR_PAGINA, estaVacio, lineaDeEvento } from './historial';
import { MENSAJE_DEL_MOTIVO, tonoDeLaDecision } from '../escaner/logica';

/**
 * El historial de la puerta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE SE VIGILA AQUI ES QUE NO HAYA UNA SEGUNDA VERDAD.                │
 * │                                                                          │
 * │ El escaner —validado en iPhone en STAFF-2— ya decide como se llama cada  │
 * │ motivo y de que color va cada decision. Si el historial se inventara las │
 * │ suyas, el mismo intento se explicaria de dos maneras segun se mirara en  │
 * │ la puerta o despues, y quien atiende no sabria cual creer.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const evento = (parcial: Partial<AccessEvent>): AccessEvent => ({
  id: 'e1',
  memberId: 'm1',
  memberName: 'Lucía Fernández',
  decision: 'ALLOW',
  reason: 'OK',
  isRetry: false,
  occurredAt: '2026-09-08T08:12:00.000Z',
  ...parcial,
});

describe('como se lee una fila del historial', () => {
  it('el motivo sale del MISMO sitio que el del escaner', () => {
    for (const motivo of ACCESS_REASONS) {
      const linea = lineaDeEvento(evento({ reason: motivo }));
      expect(linea.motivo, motivo).toBe(MENSAJE_DEL_MOTIVO[motivo]);
    }
  });

  it('y el tono, tambien', () => {
    for (const decision of ['ALLOW', 'WARN', 'DENY'] as const) {
      expect(lineaDeEvento(evento({ decision })).tono).toBe(tonoDeLaDecision(decision));
    }
  });

  it('ningun motivo se enseña en crudo', () => {
    for (const motivo of ACCESS_REASONS) {
      const texto = lineaDeEvento(evento({ reason: motivo })).motivo;
      expect(texto, motivo).not.toBe(motivo);
      expect(texto).not.toMatch(/^[A-Z_]+$/);
    }
  });

  /*
   * Un intento sin socio identificado es un caso REAL: un codigo que no
   * correspondia a nadie, o uno caducado que ya no se puede resolver. Dejar el
   * hueco en blanco lo haria parecer un fallo de datos.
   */
  it('sin socio identificado se dice, no se deja en blanco', () => {
    const linea = lineaDeEvento(evento({ memberId: null, memberName: null }));
    expect(linea.titulo).toBe('Sin socio identificado');
    expect(linea.titulo.trim()).not.toBe('');
  });

  it('con socio, el titulo es su nombre', () => {
    expect(lineaDeEvento(evento({})).titulo).toBe('Lucía Fernández');
  });

  /*
   * Una relectura es el mismo carne leido dos veces dentro de la ventana de
   * tres segundos. Sin marcarla, la lista parece tener duplicados.
   */
  it('una relectura se marca', () => {
    expect(lineaDeEvento(evento({ isRetry: true })).relectura).toBe(true);
    expect(lineaDeEvento(evento({ isRetry: false })).relectura).toBe(false);
  });
});

describe('cuantos se piden', () => {
  it('los mismos 25 que pide el panel', () => {
    expect(POR_PAGINA).toBe(25);
    // El endpoint admite hasta 100: traerlos todos no adelantaria nada.
    expect(POR_PAGINA).toBeLessThanOrEqual(100);
  });

  it('vacio NO es un error', () => {
    expect(estaVacio(0)).toBe(true);
    expect(estaVacio(3)).toBe(false);
  });
});
