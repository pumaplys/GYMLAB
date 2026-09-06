import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ACCESS_DECISIONS, ACCESS_REASONS } from '@gymlab/contracts';
import type { AccessResult } from '@gymlab/contracts';
import {
  LARGO_MAXIMO,
  LARGO_MINIMO,
  MENSAJE_DEL_MOTIVO,
  TITULO_DE_LA_DECISION,
  detalleDeCuota,
  esTokenDeAcceso,
  nombreDelSocio,
  tonoDeLaDecision,
} from './logica';

/**
 * Un token con la FORMA del real: 89 bytes en base64url. Aleatorio y sin
 * ninguna clave de por medio — no lo firma nadie y no abre nada.
 */
function tokenConLaFormaReal(): string {
  return randomBytes(89).toString('base64url');
}

describe('que se acepta como carne y que no', () => {
  it('el token real mide 119 caracteres, y eso cabe en el rango', () => {
    // Documenta el tamaño de HOY —89 bytes: version, gym, socio, jti,
    // caducidad y firma— sin atar el filtro a el.
    const token = tokenConLaFormaReal();
    expect(token).toHaveLength(119);
    expect(esTokenDeAcceso(token)).toBe(true);
  });

  it('acepta cien tokens seguidos con la forma real', () => {
    // El alfabeto base64url es aleatorio: un solo ejemplo podria no traer ni
    // un `-` ni un `_` y el filtro pasaria por casualidad.
    for (let i = 0; i < 100; i++) {
      expect(esTokenDeAcceso(tokenConLaFormaReal())).toBe(true);
    }
  });

  it('los espacios de alrededor no lo estropean', () => {
    expect(esTokenDeAcceso(` ${tokenConLaFormaReal()}\n`)).toBe(true);
  });

  /*
   * Lo que se va a colar de verdad delante del objetivo en un gimnasio. Nada
   * de esto puede acabar dentro de un POST a la API.
   */
  it('rechaza los QR que NO son un carne', () => {
    const relleno = 'a'.repeat(120);
    const casos: Array<[string, string]> = [
      ['una URL', 'https://gymlabfit.tech/socios/12345678-1234-4123-8123-123456789012'],
      ['un enlace profundo de la propia app', 'rinda://panel'],
      ['la wifi del gimnasio', 'WIFI:S:GimnasioVista;T:WPA;P:unaclave;;'],
      ['una tarjeta de visita', 'BEGIN:VCARD\nVERSION:3.0\nFN:Alguien\nEND:VCARD'],
      ['un telefono', 'tel:+34600000000'],
      ['un correo', 'mailto:alguien@ejemplo.local'],
      ['texto con tildes', `${relleno} carné del socio`],
      ['texto con espacios', `${relleno.slice(0, 60)} ${relleno.slice(0, 60)}`],
      ['base64 clasico, con + y /', `${'A'.repeat(100)}+/${'B'.repeat(17)}`],
      ['vacio', ''],
      ['solo espacios', '     '],
      ['demasiado corto', 'abc'],
      ['justo por debajo del minimo', 'a'.repeat(LARGO_MINIMO - 1)],
      ['por encima de lo que admite el contrato', 'a'.repeat(LARGO_MAXIMO + 1)],
    ];
    for (const [que, texto] of casos) {
      expect(esTokenDeAcceso(texto), que).toBe(false);
    }
  });

  it('los limites del rango son inclusivos', () => {
    expect(esTokenDeAcceso('a'.repeat(LARGO_MINIMO))).toBe(true);
    expect(esTokenDeAcceso('a'.repeat(LARGO_MAXIMO))).toBe(true);
  });
});

describe('lo que se le dice a quien esta en la puerta', () => {
  it('hay un mensaje para CADA motivo del contrato, sin sobras', () => {
    // Si el contrato añade un motivo, esto falla en vez de dejarlo caer en un
    // generico. El tipo ya lo obliga al compilar; esto lo dice tambien en CI.
    expect(Object.keys(MENSAJE_DEL_MOTIVO).sort()).toEqual([...ACCESS_REASONS].sort());
  });

  it('hay un titulo para CADA decision, sin sobras', () => {
    expect(Object.keys(TITULO_DE_LA_DECISION).sort()).toEqual([...ACCESS_DECISIONS].sort());
  });

  it('ningun mensaje esta vacio ni repetido', () => {
    const textos = Object.values(MENSAJE_DEL_MOTIVO);
    for (const t of textos) expect(t.trim().length).toBeGreaterThan(10);
    expect(new Set(textos).size).toBe(textos.length);
  });

  it('el tono sale de la decision, no del motivo', () => {
    expect(tonoDeLaDecision('ALLOW')).toBe('exito');
    expect(tonoDeLaDecision('WARN')).toBe('aviso');
    expect(tonoDeLaDecision('DENY')).toBe('peligro');
  });

  /*
   * El caso que el producto nombro: un DENY nunca se pinta como algo bueno,
   * venga del motivo que venga. Se recorren TODOS.
   */
  it('ningun motivo puede volver verde un DENY', () => {
    for (const reason of ACCESS_REASONS) {
      const negado = resultado({ decision: 'DENY', reason });
      expect(tonoDeLaDecision(negado.decision), reason).toBe('peligro');
    }
  });
});

function resultado(parcial: Partial<AccessResult>): AccessResult {
  return {
    decision: 'ALLOW',
    reason: 'OK',
    member: { id: 'x', memberNumber: 7, firstName: 'Nombre', lastName: 'Apellido' },
    diasRestantes: null,
    isRetry: false,
    ...parcial,
  } as AccessResult;
}

describe('el detalle de la cuota solo aparece donde significa algo', () => {
  it('un aviso dice cuantos dias quedan', () => {
    expect(detalleDeCuota(resultado({ reason: 'DUES_WARN', diasRestantes: 3 }))).toBe(
      'Vence en 3 días.',
    );
    expect(detalleDeCuota(resultado({ reason: 'DUES_WARN', diasRestantes: 1 }))).toBe(
      'Vence mañana.',
    );
  });

  it('una cuota vencida dice cuanto hace', () => {
    expect(detalleDeCuota(resultado({ reason: 'DUES_EXPIRED', diasRestantes: 0 }))).toBe(
      'Venció hoy.',
    );
    expect(detalleDeCuota(resultado({ reason: 'DUES_EXPIRED', diasRestantes: -1 }))).toBe(
      'Venció ayer.',
    );
    expect(detalleDeCuota(resultado({ reason: 'DUES_EXPIRED', diasRestantes: -9 }))).toBe(
      'Venció hace 9 días.',
    );
  });

  it('en los demas motivos NO se inventa nada', () => {
    for (const reason of ACCESS_REASONS) {
      if (reason === 'DUES_WARN' || reason === 'DUES_EXPIRED') continue;
      expect(detalleDeCuota(resultado({ reason, diasRestantes: 5 })), reason).toBeNull();
    }
  });

  it('sin dias no hay detalle, ni siquiera en los dos que lo admiten', () => {
    expect(detalleDeCuota(resultado({ reason: 'DUES_WARN', diasRestantes: null }))).toBeNull();
    expect(detalleDeCuota(resultado({ reason: 'DUES_EXPIRED', diasRestantes: null }))).toBeNull();
  });
});

describe('el nombre del socio', () => {
  it('se compone del contrato tal cual', () => {
    expect(nombreDelSocio(resultado({}))).toBe('Nombre Apellido');
  });

  it('sin socio identificado es null, no una cadena vacia', () => {
    // La pantalla distingue los dos casos: `null` enseña una frase que lo
    // explica; una cadena vacia dejaria un hueco que parece un fallo de carga.
    expect(nombreDelSocio(resultado({ member: null }))).toBeNull();
  });
});
