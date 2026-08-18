import { ACCESS_DECISIONS, ACCESS_REASONS, type AccessResult } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  MENSAJE_DEL_MOTIVO,
  TITULO_DE_LA_DECISION,
  debeEnviar,
  detalleDeCuota,
  nombreDelSocio,
  tonoDeLaDecision,
} from './escaner-logica';

const resultado = (over: Partial<AccessResult> = {}): AccessResult => ({
  decision: 'ALLOW',
  reason: 'OK',
  member: { id: 'a', memberNumber: 12, firstName: 'Ana', lastName: 'Socia' },
  diasRestantes: null,
  isRetry: false,
  ...over,
});

describe('mensajes de los motivos', () => {
  it('los DIEZ motivos del contrato tienen mensaje propio', () => {
    // Si el contrato gana un motivo, esto falla hasta que alguien decida como
    // se le cuenta a quien esta en la puerta.
    for (const motivo of ACCESS_REASONS) {
      expect(MENSAJE_DEL_MOTIVO[motivo], motivo).toBeTruthy();
    }
    expect(Object.keys(MENSAJE_DEL_MOTIVO)).toHaveLength(ACCESS_REASONS.length);
  });

  it('ninguno cae en un mensaje generico ni repetido', () => {
    const textos = ACCESS_REASONS.map((m) => MENSAJE_DEL_MOTIVO[m]);

    // Todos distintos: dos motivos con el mismo texto son un motivo perdido.
    expect(new Set(textos).size).toBe(textos.length);

    for (const texto of textos) {
      expect(texto.length).toBeGreaterThan(15);
      expect(texto).not.toMatch(/desconocido|generico|error inesperado/i);
    }
  });

  it('los motivos que deniegan dicen que hacer, no solo que paso', () => {
    // El mostrador tiene a alguien delante esperando: necesita el siguiente paso.
    expect(MENSAJE_DEL_MOTIVO.DUES_EXPIRED).toMatch(/cóbrala|cobrar/i);
    expect(MENSAJE_DEL_MOTIVO.NO_SUBSCRIPTION).toMatch(/alta/i);
    expect(MENSAJE_DEL_MOTIVO.TOKEN_EXPIRED).toMatch(/genere|generar/i);
    expect(MENSAJE_DEL_MOTIVO.TOKEN_REUSED).toMatch(/nuevo/i);
  });
});

describe('decisiones', () => {
  it('las tres decisiones tienen titulo y tono', () => {
    for (const decision of ACCESS_DECISIONS) {
      expect(TITULO_DE_LA_DECISION[decision], decision).toBeTruthy();
      expect(tonoDeLaDecision(decision), decision).toBeTruthy();
    }
  });

  it('el tono sale de la decision, nunca del motivo', () => {
    /*
     * Un DENY con motivo `OK` no deberia existir, pero si el servidor lo
     * enviara, la pantalla tiene que decir NO PASA. Traducir el motivo a color
     * por nuestra cuenta abriria la puerta a pintar verde sobre un DENY.
     */
    expect(tonoDeLaDecision('DENY')).toBe('error');
    expect(tonoDeLaDecision('ALLOW')).toBe('exito');
    expect(tonoDeLaDecision('WARN')).toBe('informacion');
  });
});

describe('detalle de la cuota', () => {
  it('convierte "vence pronto" en algo util', () => {
    expect(detalleDeCuota(resultado({ reason: 'DUES_WARN', diasRestantes: 2 }))).toBe(
      'Vence en 2 días.',
    );
    expect(detalleDeCuota(resultado({ reason: 'DUES_WARN', diasRestantes: 1 }))).toBe(
      'Vence mañana.',
    );
  });

  it('con la cuota vencida cuenta los dias en positivo', () => {
    // El backend manda negativo; «venció hace -3 días» no se le dice a nadie.
    expect(detalleDeCuota(resultado({ reason: 'DUES_EXPIRED', diasRestantes: -3 }))).toBe(
      'Venció hace 3 días.',
    );
    expect(detalleDeCuota(resultado({ reason: 'DUES_EXPIRED', diasRestantes: 0 }))).toBe(
      'Venció hoy.',
    );
    expect(detalleDeCuota(resultado({ reason: 'DUES_EXPIRED', diasRestantes: -1 }))).toBe(
      'Venció ayer.',
    );
  });

  it('no inventa detalle donde no aplica', () => {
    expect(detalleDeCuota(resultado({ reason: 'OK', diasRestantes: 20 }))).toBeNull();
    expect(detalleDeCuota(resultado({ reason: 'DUES_WARN', diasRestantes: null }))).toBeNull();
    expect(detalleDeCuota(resultado({ reason: 'BAD_SIGNATURE', diasRestantes: null }))).toBeNull();
  });
});

describe('identidad del socio', () => {
  it('devuelve el nombre completo', () => {
    expect(nombreDelSocio(resultado())).toBe('Ana Socia');
  });

  it('sin socio devuelve null, no una cadena vacia', () => {
    // Pasa con firma invalida o token caducado: el token no identifica a nadie
    // de fiar, y la pantalla debe poder distinguirlo de un nombre en blanco.
    expect(nombreDelSocio(resultado({ member: null }))).toBeNull();
  });
});

describe('proteccion frente a envios duplicados', () => {
  const quieto = { ultimoEnviado: null, procesando: false };

  it('envia un token nuevo', () => {
    expect(debeEnviar('abc', quieto)).toBe(true);
  });

  it('NO reenvia el mismo token que la camara vuelve a leer', () => {
    /*
     * Es el caso real: un QR delante del objetivo se decodifica en cada
     * fotograma. Sin esto, la primera peticion consume el token y las
     * siguientes acabarian mostrando TOKEN_REUSED sobre un acceso correcto.
     */
    expect(debeEnviar('abc', { ultimoEnviado: 'abc', procesando: false })).toBe(false);
  });

  it('NO envia mientras hay una verificacion en curso', () => {
    expect(debeEnviar('otro', { ultimoEnviado: 'abc', procesando: true })).toBe(false);
  });

  it('SI envia un token distinto: el siguiente socio de la cola', () => {
    expect(debeEnviar('def', { ultimoEnviado: 'abc', procesando: false })).toBe(true);
  });

  it('ignora vacio y espacios', () => {
    expect(debeEnviar('', quieto)).toBe(false);
    expect(debeEnviar('   ', quieto)).toBe(false);
  });
});
