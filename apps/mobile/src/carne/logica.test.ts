import { describe, expect, it } from 'vitest';
import type { DuesStatus } from '@gymlab/contracts';
import {
  SEGUNDOS_DE_AVISO,
  avisaDeQueLaPuertaPuedeNegar,
  SE_PIDE_AL_ENTRAR,
  debePedirTrasSegundoPlano,
  haCaducado,
  estadoDelCodigo,
  lecturaDeCuota,
  segundosRestantes,
  textoDeCuentaAtras,
  type EstadoDelPase,
} from './logica';

/** Un instante fijo, para que las pruebas no dependan de cuando se ejecuten. */
const AHORA = Date.parse('2026-09-01T12:00:00.000Z');
const en = (segundos: number) => new Date(AHORA + segundos * 1000).toISOString();
const codigo = (segundos: number) => ({ token: 'da-igual', expiresAt: en(segundos) });

function cuota(parcial: Partial<DuesStatus>): DuesStatus {
  return {
    estado: 'AL_CORRIENTE',
    puedeAcceder: true,
    diasRestantes: 19,
    hasta: '2026-09-20',
    planName: 'Mensual',
    ...parcial,
  } as DuesStatus;
}

describe('la cuenta atras del codigo', () => {
  it('cuenta contra la hora del SERVIDOR', () => {
    expect(segundosRestantes(en(60), AHORA)).toBe(60);
    expect(segundosRestantes(en(1), AHORA)).toBe(1);
  });

  it('nunca devuelve negativos: caducado es caducado', () => {
    expect(segundosRestantes(en(-1), AHORA)).toBe(0);
    expect(segundosRestantes(en(-3600), AHORA)).toBe(0);
  });

  it('una fecha ilegible se trata como caducada, no como infinita', () => {
    // Un `expiresAt` que no se entiende no puede convertirse en un codigo
    // eterno: ante la duda, caducado.
    expect(segundosRestantes('esto no es una fecha', AHORA)).toBe(0);
  });

  it('el texto habla de segundos, y en singular cuando toca', () => {
    expect(textoDeCuentaAtras(45)).toBe('El codigo caduca en 45 segundos.');
    expect(textoDeCuentaAtras(1)).toBe('El codigo caduca en 1 segundo.');
    expect(textoDeCuentaAtras(0)).toBe('El codigo ha caducado. Genera otro.');
  });

  it('el texto nunca dice un numero negativo', () => {
    expect(textoDeCuentaAtras(-5)).toBe('El codigo ha caducado. Genera otro.');
  });
});

describe('en que punto esta el codigo', () => {
  it('sin codigo, sin codigo', () => {
    expect(estadoDelCodigo(null, AHORA)).toBe('sinCodigo');
  });

  it('recien generado esta vigente', () => {
    expect(estadoDelCodigo(codigo(60), AHORA)).toBe('vigente');
  });

  it('avisa antes de caducar, no cuando ya ha caducado', () => {
    expect(estadoDelCodigo(codigo(SEGUNDOS_DE_AVISO + 1), AHORA)).toBe('vigente');
    expect(estadoDelCodigo(codigo(SEGUNDOS_DE_AVISO), AHORA)).toBe('porCaducar');
    expect(estadoDelCodigo(codigo(1), AHORA)).toBe('porCaducar');
  });

  it('a cero, caducado', () => {
    expect(estadoDelCodigo(codigo(0), AHORA)).toBe('caducado');
    expect(estadoDelCodigo(codigo(-10), AHORA)).toBe('caducado');
  });
});

describe('la politica de generacion', () => {
  const listo = (s: number): EstadoDelPase => ({ fase: 'listo', codigo: codigo(s) });

  it('entrar en Carne SIEMPRE pide uno nuevo', () => {
    // Aunque el anterior no haya caducado: es de un solo uso y no sabemos si
    // un escaner ya lo consumio.
    expect(SE_PIDE_AL_ENTRAR).toBe(true);
  });

  it('volver del segundo plano con un codigo VIVO no pide otro', () => {
    expect(debePedirTrasSegundoPlano(listo(30), AHORA)).toBe(false);
  });

  it('volver del segundo plano con el codigo caducado si pide otro', () => {
    expect(debePedirTrasSegundoPlano(listo(-1), AHORA)).toBe(true);
    expect(debePedirTrasSegundoPlano({ fase: 'caducado' } as EstadoDelPase, AHORA)).toBe(true);
  });

  it('tras un error, volver del segundo plano reintenta', () => {
    expect(debePedirTrasSegundoPlano({ fase: 'error', mensaje: 'x' } as EstadoDelPase, AHORA)).toBe(true);
  });

  it('con una peticion en vuelo NO se lanza otra', () => {
    expect(debePedirTrasSegundoPlano({ fase: 'pidiendo' } as EstadoDelPase, AHORA)).toBe(false);
  });

  it('el pase caducado se detecta para retirarlo de la pantalla', () => {
    expect(haCaducado(listo(-1), AHORA)).toBe(true);
    expect(haCaducado(listo(5), AHORA)).toBe(false);
    expect(haCaducado({ fase: 'pidiendo' } as EstadoDelPase, AHORA)).toBe(false);
  });
});

describe('la cuota se traduce, no se recalcula', () => {
  it('cubre los SEIS estados del servidor', () => {
    const estados = [
      'AL_CORRIENTE',
      'POR_VENCER',
      'EN_GRACIA',
      'VENCIDA',
      'PAUSADA',
      'SIN_SUSCRIPCION',
    ] as const;
    for (const estado of estados) {
      const l = lecturaDeCuota(cuota({ estado }));
      expect(l.titulo.length).toBeGreaterThan(0);
      expect(l.explicacion.endsWith('.')).toBe(true);
    }
  });

  it('cada estado tiene su titulo: no se colapsan en verde y rojo', () => {
    const titulos = (
      ['AL_CORRIENTE', 'POR_VENCER', 'EN_GRACIA', 'VENCIDA', 'PAUSADA', 'SIN_SUSCRIPCION'] as const
    ).map((estado) => lecturaDeCuota(cuota({ estado })).titulo);
    expect(new Set(titulos).size).toBe(6);
  });

  it('ninguna explicacion manda a pagar desde la app: no se puede', () => {
    const estados = [
      'AL_CORRIENTE',
      'POR_VENCER',
      'EN_GRACIA',
      'VENCIDA',
      'PAUSADA',
      'SIN_SUSCRIPCION',
    ] as const;
    for (const estado of estados) {
      expect(lecturaDeCuota(cuota({ estado })).explicacion).not.toMatch(
        /paga aqui|pagar aqui|renueva aqui|renovar aqui/i,
      );
    }
  });
});

describe('cuota activa y codigo valido no son lo mismo', () => {
  it('se avisa cuando el servidor dice que no puede acceder', () => {
    expect(avisaDeQueLaPuertaPuedeNegar(cuota({ estado: 'VENCIDA', puedeAcceder: false }))).toBe(
      true,
    );
    expect(avisaDeQueLaPuertaPuedeNegar(cuota({ estado: 'PAUSADA', puedeAcceder: false }))).toBe(
      true,
    );
  });

  it('no se avisa cuando SI puede acceder, aunque la cuota este por vencer', () => {
    expect(avisaDeQueLaPuertaPuedeNegar(cuota({ estado: 'POR_VENCER', puedeAcceder: true }))).toBe(
      false,
    );
    expect(avisaDeQueLaPuertaPuedeNegar(cuota({ estado: 'EN_GRACIA', puedeAcceder: true }))).toBe(
      false,
    );
  });

  it('se usa `puedeAcceder` del servidor, no una lista de estados de aqui', () => {
    // Si algun dia el servidor decidiera que una cuota vencida SI puede pasar,
    // la pantalla tiene que obedecerle.
    expect(avisaDeQueLaPuertaPuedeNegar(cuota({ estado: 'VENCIDA', puedeAcceder: true }))).toBe(
      false,
    );
  });

  it('ningun texto de la pantalla promete acceso', () => {
    const estados = [
      'AL_CORRIENTE',
      'POR_VENCER',
      'EN_GRACIA',
      'VENCIDA',
      'PAUSADA',
      'SIN_SUSCRIPCION',
    ] as const;
    for (const estado of estados) {
      const l = lecturaDeCuota(cuota({ estado }));
      expect(`${l.titulo} ${l.explicacion}`).not.toMatch(/acceso permitido|puedes pasar|entrada ok/i);
    }
  });
});
