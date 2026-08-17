import { ACCESS_REASONS, PAYMENT_CONCEPTS, PAYMENT_METHODS } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  CONCEPTO,
  METODO,
  MOTIVO_DE_ACCESO,
  comoFechaYHora,
  esAvisoDeSeguridad,
  totalDePaginas,
} from './historial-logica';

/**
 * COMO SE LE CUENTAN AL SOCIO SUS HISTORIALES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE PROTEGEN ESTAS PRUEBAS ES QUE NO SE ESCAPE UN CODIGO TECNICO.    │
 * │                                                                          │
 * │ Los tres mapas son `Record<...>` completos sobre enums del contrato, asi │
 * │ que anadir un valor nuevo rompe la compilacion. Estas pruebas cierran el │
 * │ otro lado: que ninguno de los que YA existen se quedara sin texto o      │
 * │ acabara pintando su propio nombre en la pantalla de una persona.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('los enums del contrato tienen todos su texto', () => {
  it('cada concepto de pago', () => {
    for (const concepto of PAYMENT_CONCEPTS) {
      expect(CONCEPTO[concepto]).toBeTruthy();
      expect(CONCEPTO[concepto]).not.toBe(concepto);
    }
  });

  it('cada metodo de pago', () => {
    for (const metodo of PAYMENT_METHODS) {
      expect(METODO[metodo]).toBeTruthy();
      expect(METODO[metodo]).not.toBe(metodo);
    }
  });

  it('cada motivo de acceso, incluidos los que no pueden llegar', () => {
    // Los tecnicos se registran sin socio, asi que no aparecen en su historial.
    // Se les da texto igualmente: un `Record` incompleto no compila, y un texto
    // sin usar es mas barato que una pantalla en blanco si algo cambia.
    for (const motivo of ACCESS_REASONS) {
      expect(MOTIVO_DE_ACCESO[motivo]).toBeTruthy();
      expect(MOTIVO_DE_ACCESO[motivo]).not.toContain('_');
    }
  });

  it('ningun texto es un codigo en mayusculas', () => {
    const textos = [
      ...Object.values(CONCEPTO),
      ...Object.values(METODO),
      ...Object.values(MOTIVO_DE_ACCESO),
    ];
    for (const texto of textos) {
      expect(texto).not.toMatch(/^[A-Z_]+$/);
    }
  });
});

describe('que se destaca como aviso de seguridad', () => {
  const evento = (reason: (typeof ACCESS_REASONS)[number]) => ({
    decision: 'DENY' as const,
    reason,
    isRetry: false,
    occurredAt: '2026-08-16T10:00:00.000Z',
  });

  it('solo el codigo reutilizado', () => {
    // Es lo unico que le dice algo sobre SU codigo que no sabia. Una cuota
    // vencida ya la conoce por otras vias, y marcarla como alerta seria ruido.
    expect(esAvisoDeSeguridad(evento('TOKEN_REUSED'))).toBe(true);
    expect(esAvisoDeSeguridad(evento('DUES_EXPIRED'))).toBe(false);
    expect(esAvisoDeSeguridad(evento('NO_SUBSCRIPTION'))).toBe(false);
    expect(esAvisoDeSeguridad(evento('MEMBER_INACTIVE'))).toBe(false);
    expect(esAvisoDeSeguridad({ ...evento('OK'), decision: 'ALLOW' })).toBe(false);
  });

  it('el texto de reutilizado no acusa a nadie', () => {
    // Puede ser que lo compartiera, que le hicieran una foto, o dos tornos a la
    // vez. Acusar desde aqui seria irresponsable.
    const texto = MOTIVO_DE_ACCESO.TOKEN_REUSED.toLowerCase();
    expect(texto).not.toMatch(/fraude|robad|sospech|infracc/);
  });
});

describe('la fecha con hora', () => {
  it('lleva hora, que es lo que distingue una entrada de otra el mismo dia', () => {
    const texto = comoFechaYHora('2026-08-16T10:30:00.000Z');
    expect(texto).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(texto).toMatch(/\d{2}:\d{2}/);
  });
});

describe('cuantas paginas hay', () => {
  it('reparte exacto e inexacto', () => {
    expect(totalDePaginas(40, 20)).toBe(2);
    expect(totalDePaginas(41, 20)).toBe(3);
  });

  it('sin datos sigue habiendo una pagina, no cero', () => {
    // Con cero, la paginacion diria "pagina 1 de 0", que no significa nada.
    expect(totalDePaginas(0, 20)).toBe(1);
  });
});
