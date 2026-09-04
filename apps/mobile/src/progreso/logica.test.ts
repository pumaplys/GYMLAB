import { describe, expect, it } from 'vitest';
import type { BodyMetric } from '@gymlab/contracts';
import {
  MEDIDAS,
  caminoDe,
  comoCambio,
  comoNumero,
  coordenadasDe,
  cruzanAnios,
  dominioDe,
  historial,
  lecturaDeCambio,
  lecturaDeFila,
  medicionMasReciente,
  medidaDe,
  medidaPorDefecto,
  medidaVisible,
  medidasConDatos,
  otrasMedidas,
  referenciasDeTiempo,
  resumenDeMedida,
  serieConstante,
  serieDe,
  type Punto,
} from './logica';

function medicion(iso: string, valores: Partial<BodyMetric> = {}): BodyMetric {
  return {
    id: `m-${iso}`,
    measuredAt: iso,
    weightKg: null,
    bodyFatPercent: null,
    chestCm: null,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    notes: null,
    consentVersion: 'v1',
    ...valores,
  } as BodyMetric;
}

function puntos(...valores: readonly number[]): readonly Punto[] {
  return valores.map((valor, i) => ({
    instante: Date.UTC(2026, 0, i + 1),
    valor,
    iso: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
  }));
}

describe('que se puede medir', () => {
  it('son las SIETE del contrato, y solo esas', () => {
    expect(MEDIDAS.map((m) => m.campo)).toEqual([
      'weightKg',
      'bodyFatPercent',
      'chestCm',
      'waistCm',
      'hipCm',
      'armCm',
      'thighCm',
    ]);
  });

  it('cada una con su unidad real', () => {
    expect(medidaDe('weightKg').unidad).toBe('kg');
    expect(medidaDe('bodyFatPercent').unidad).toBe('%');
    for (const campo of ['chestCm', 'waistCm', 'hipCm', 'armCm', 'thighCm'] as const) {
      expect(medidaDe(campo).unidad).toBe('cm');
    }
  });

  it('solo se ofrecen las que tienen algun valor', () => {
    const datos = [medicion('2026-08-24T08:00:00.000Z', { weightKg: 71, waistCm: 79 })];
    expect(medidasConDatos(datos).map((m) => m.campo)).toEqual(['weightKg', 'waistCm']);
  });

  it('sin mediciones no se ofrece ninguna', () => {
    expect(medidasConDatos([])).toEqual([]);
    expect(medidaPorDefecto([])).toBeNull();
  });

  it('la de por defecto es la primera CON DATOS del orden fijo, no la primera que llegue', () => {
    // Sin peso: la siguiente del orden que si tenga valor.
    const datos = [medicion('2026-08-24T08:00:00.000Z', { waistCm: 79, bodyFatPercent: 18 })];
    expect(medidaPorDefecto(datos)).toBe('bodyFatPercent');
  });
});

describe('la medida que se mira sobrevive a un refresco, o se pierde bien', () => {
  const datos = [medicion('2026-08-24T08:00:00.000Z', { weightKg: 71, waistCm: 79 })];

  it('si la elegida sigue teniendo datos, se sigue mirando', () => {
    expect(medidaVisible(datos, 'waistCm')).toBe('waistCm');
  });

  it('si se queda sin datos, se vuelve a la primera que si los tiene', () => {
    expect(medidaVisible(datos, 'hipCm')).toBe('weightKg');
  });

  it('sin elegir, la de por defecto', () => {
    expect(medidaVisible(datos, null)).toBe('weightKg');
  });

  it('sin mediciones, ninguna', () => {
    expect(medidaVisible([], 'weightKg')).toBeNull();
  });
});

describe('las series', () => {
  it('van del mas antiguo al mas reciente, aunque la API mande al reves', () => {
    const datos = [
      medicion('2026-08-24T08:00:00.000Z', { weightKg: 71 }),
      medicion('2026-06-24T08:00:00.000Z', { weightKg: 73 }),
      medicion('2026-07-24T08:00:00.000Z', { weightKg: 72 }),
    ];
    expect(serieDe(datos, 'weightKg').map((p) => p.valor)).toEqual([73, 72, 71]);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LA PRUEBA QUE IMPIDE DIBUJAR UNA CAIDA A CERO.                          │
   * │                                                                          │
   * │ Las siete medidas son anulables y casi nadie las mide todas. Si un dia   │
   * │ alguien "arregla" los huecos con `?? 0`, esta prueba se pone roja.       │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('un `null` NO se convierte en cero: se quita el punto', () => {
    const datos = [
      medicion('2026-08-24T08:00:00.000Z', { weightKg: 71 }),
      medicion('2026-07-24T08:00:00.000Z', { weightKg: null, waistCm: 80 }),
      medicion('2026-06-24T08:00:00.000Z', { weightKg: 73 }),
    ];
    const serie = serieDe(datos, 'weightKg');
    expect(serie.map((p) => p.valor)).toEqual([73, 71]);
    expect(serie.map((p) => p.valor)).not.toContain(0);
  });

  it('cada medida tiene su propia serie, con sus propias fechas', () => {
    const datos = [
      medicion('2026-08-24T08:00:00.000Z', { weightKg: 71 }),
      medicion('2026-07-24T08:00:00.000Z', { waistCm: 80 }),
    ];
    expect(serieDe(datos, 'weightKg')).toHaveLength(1);
    expect(serieDe(datos, 'waistCm')).toHaveLength(1);
    expect(serieDe(datos, 'hipCm')).toHaveLength(0);
  });

  it('una fecha ilegible no rompe la serie: se descarta el punto', () => {
    const datos = [
      medicion('no-es-una-fecha', { weightKg: 71 }),
      medicion('2026-07-24T08:00:00.000Z', { weightKg: 72 }),
    ];
    expect(serieDe(datos, 'weightKg')).toHaveLength(1);
  });
});

describe('el resumen de una medida', () => {
  it('sin puntos, no hay nada', () => {
    expect(resumenDeMedida([]).tipo).toBe('sinDatos');
  });

  it('con UN punto hay valor y fecha, pero NO tendencia inventada', () => {
    const resumen = resumenDeMedida(puntos(71));
    expect(resumen.tipo).toBe('unico');
    if (resumen.tipo !== 'unico') return;
    expect(resumen.ultimo.valor).toBe(71);
    expect(resumen).not.toHaveProperty('cambio');
  });

  it('con dos o mas, el cambio es la resta de las dos ULTIMAS', () => {
    const resumen = resumenDeMedida(puntos(75, 73, 71.4));
    if (resumen.tipo !== 'serie') throw new Error('deberia ser serie');
    expect(resumen.cambio.delta).toBeCloseTo(-1.6, 5);
    expect(resumen.ultimo.valor).toBe(71.4);
  });
});

describe('los numeros, escritos', () => {
  it('con coma decimal y sin ceros de relleno', () => {
    expect(comoNumero(71.4)).toBe('71,4');
    expect(comoNumero(72)).toBe('72');
    expect(comoNumero(72.0)).toBe('72');
    expect(comoNumero(18.25)).toBe('18,25');
  });

  it('el cambio lleva su signo y su unidad', () => {
    expect(comoCambio(-1.2, 'kg')).toBe('−1,2 kg');
    expect(comoCambio(0.8, 'cm')).toBe('+0,8 cm');
  });

  it('dos mediciones iguales NO son "+0"', () => {
    expect(comoCambio(0, 'kg')).toBe('Sin cambio');
    expect(comoCambio(0.001, 'kg')).toBe('Sin cambio');
  });

  /*
   * Lo encontro una captura: el caso del cero devolvia la frase entera y en
   * pantalla salia "Sin cambio desde la anterior (kg) desde la anterior".
   */
  it('devuelve SOLO la magnitud: la frase la compone quien la pinta', () => {
    for (const delta of [-1.2, 0, 0.8]) {
      expect(comoCambio(delta, 'kg')).not.toMatch(/desde la anterior/);
    }
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LA PANTALLA NO DICE SI UN CAMBIO ES BUENO.                              │
   * │                                                                          │
   * │ Son datos de salud y quien los toma es un entrenador. "Has mejorado"     │
   * │ sobre una bajada de peso es un juicio clinico que nadie ha hecho.        │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('ni el texto ni la lectura valoran el cambio', () => {
    const prohibidas =
      /mejor|peor|bien|mal|genial|enhorabuena|objetivo|ideal|progres|logr|exito|fracas|sub[ei]|baj[ae]|positiv|negativ/i;

    for (const delta of [-2.4, -0.1, 0, 0.1, 3.5]) {
      for (const medida of MEDIDAS) {
        expect(comoCambio(delta, medida.unidad)).not.toMatch(prohibidas);
        expect(lecturaDeCambio(delta, medida)).not.toMatch(prohibidas);
      }
    }
  });

  it('un lector de pantalla oye la unidad y la direccion, sin valorarla', () => {
    expect(lecturaDeCambio(-1.2, medidaDe('weightKg'))).toBe(
      '1,2 kg menos que en la medición anterior',
    );
    expect(lecturaDeCambio(0.8, medidaDe('waistCm'))).toBe(
      '0,8 cm mas que en la medición anterior',
    );
  });
});

describe('el dominio del grafico', () => {
  it('NO empieza en cero: aplastaria el cambio real', () => {
    const dominio = dominioDe(puntos(71, 72, 73));
    expect(dominio.min).toBeGreaterThan(60);
  });

  it('contiene todos los valores, con aire por arriba y por abajo', () => {
    const dominio = dominioDe(puntos(71, 75, 73));
    expect(dominio.min).toBeLessThan(71);
    expect(dominio.max).toBeGreaterThan(75);
  });

  /*
   * A. TODOS LOS VALORES IGUALES. El caso que divide por cero si nadie lo mira.
   */
  it('con todos los valores iguales da un dominio valido, no degenerado', () => {
    const dominio = dominioDe(puntos(70, 70, 70, 70));
    expect(dominio.max - dominio.min).toBeGreaterThan(0);
    expect(Number.isFinite(dominio.min)).toBe(true);
    expect(Number.isFinite(dominio.max)).toBe(true);
    // Y la linea queda en el CENTRO, no pegada a un borde.
    expect((dominio.min + dominio.max) / 2).toBeCloseTo(70, 5);
  });

  /*
   * B. DIFERENCIA MINUSCULA. Sin `spanMinimo`, 200 gramos llenarian la pantalla.
   */
  it('una diferencia minuscula NO se dibuja como un desplome', () => {
    const dominio = dominioDe(puntos(70.1, 70.2, 70.0, 70.2));
    const alto = dominio.max - dominio.min;
    const ocupa = (70.2 - 70.0) / alto;
    // Menos de un 10 % del alto: se ve, pero no grita.
    expect(ocupa).toBeLessThan(0.1);
  });

  it('una diferencia grande SI ocupa el grafico', () => {
    const dominio = dominioDe(puntos(70, 85));
    const ocupa = (85 - 70) / (dominio.max - dominio.min);
    expect(ocupa).toBeGreaterThan(0.6);
  });

  /* C. UN OUTLIER. Tiene que caber, no salirse. */
  it('un valor muy alejado sigue cabiendo dentro', () => {
    const dominio = dominioDe(puntos(71, 71.5, 72, 110));
    expect(dominio.min).toBeLessThanOrEqual(71);
    expect(dominio.max).toBeGreaterThanOrEqual(110);
  });

  it('sin puntos no revienta', () => {
    const dominio = dominioDe([]);
    expect(Number.isFinite(dominio.min)).toBe(true);
    expect(dominio.max).toBeGreaterThan(dominio.min);
  });
});

describe('las coordenadas', () => {
  const ANCHO = 300;
  const ALTO = 140;

  it('nunca se salen del lienzo', () => {
    for (const serie of [puntos(70, 70, 70), puntos(71, 110), puntos(70.1, 70.2), puntos(5)]) {
      for (const c of coordenadasDe(serie, ANCHO, ALTO)) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThanOrEqual(ANCHO);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThanOrEqual(ALTO);
      }
    }
  });

  it('nunca produce NaN ni Infinity', () => {
    for (const serie of [puntos(70, 70), puntos(0), puntos(0, 0, 0), puntos(-5, -5)]) {
      for (const c of coordenadasDe(serie, ANCHO, ALTO)) {
        expect(Number.isFinite(c.x)).toBe(true);
        expect(Number.isFinite(c.y)).toBe(true);
      }
    }
  });

  it('la Y crece hacia arriba: mas valor, menos Y', () => {
    const [bajo, alto] = coordenadasDe(puntos(70, 80), ANCHO, ALTO);
    expect(alto!.y).toBeLessThan(bajo!.y);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ D. LA X SALE DEL TIEMPO REAL, NO DEL INDICE.                            │
   * │                                                                          │
   * │ Cuatro mediciones semanales y luego catorce meses de nada. Con la X por  │
   * │ indice, el parón mediria lo mismo que una semana — y el grafico contaria │
   * │ una historia que no paso.                                                │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('un hueco temporal enorme se ve enorme', () => {
    const serie: readonly Punto[] = [
      { instante: Date.UTC(2025, 5, 11), valor: 84.5, iso: '2025-06-11T00:00:00.000Z' },
      { instante: Date.UTC(2026, 7, 3), valor: 72.8, iso: '2026-08-03T00:00:00.000Z' },
      { instante: Date.UTC(2026, 7, 10), valor: 72.3, iso: '2026-08-10T00:00:00.000Z' },
      { instante: Date.UTC(2026, 7, 17), valor: 71.9, iso: '2026-08-17T00:00:00.000Z' },
    ];
    const c = coordenadasDe(serie, ANCHO, ALTO);

    const primerTramo = c[1]!.x - c[0]!.x;
    const segundoTramo = c[2]!.x - c[1]!.x;
    // Catorce meses contra una semana: el primer tramo tiene que ser enorme.
    expect(primerTramo).toBeGreaterThan(segundoTramo * 10);

    // Y con la X por indice serian los tres iguales: esto lo descarta.
    expect(primerTramo).not.toBeCloseTo(segundoTramo, 1);
  });

  it('con instantes proporcionales, las distancias son proporcionales', () => {
    const serie: readonly Punto[] = [
      { instante: 0, valor: 70, iso: 'a' },
      { instante: 100, valor: 71, iso: 'b' },
      { instante: 300, valor: 72, iso: 'c' },
    ];
    const c = coordenadasDe(serie, ANCHO, ALTO);
    expect(c[0]!.x).toBeCloseTo(0, 5);
    expect(c[1]!.x).toBeCloseTo(ANCHO / 3, 5);
    expect(c[2]!.x).toBeCloseTo(ANCHO, 5);
  });

  it('con TODOS los instantes iguales no divide por cero: reparte a lo ancho', () => {
    const serie: readonly Punto[] = [
      { instante: 1000, valor: 70, iso: 'a' },
      { instante: 1000, valor: 71, iso: 'b' },
      { instante: 1000, valor: 72, iso: 'c' },
    ];
    const c = coordenadasDe(serie, ANCHO, ALTO);
    expect(c.map((p) => p.x)).toEqual([0, ANCHO / 2, ANCHO]);
  });

  /* F. UNA SOLA MEDICION. */
  it('con un solo punto lo pone en el centro y no genera camino roto', () => {
    const c = coordenadasDe(puntos(71), ANCHO, ALTO);
    expect(c).toHaveLength(1);
    expect(c[0]!.x).toBeCloseTo(ANCHO / 2, 5);
    expect(caminoDe(c)).toMatch(/^M/);
  });

  it('el camino es una polilinea, sin curvas que suavicen el dato', () => {
    const camino = caminoDe(coordenadasDe(puntos(70, 72, 71), ANCHO, ALTO));
    expect(camino).toMatch(/^M[\d. ]+L[\d. ]+L[\d. ]+$/);
    expect(camino).not.toMatch(/[CQST]/);
  });

  it('sin puntos, camino vacio y sin excepcion', () => {
    expect(coordenadasDe([], ANCHO, ALTO)).toEqual([]);
    expect(caminoDe([])).toBe('');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DOS COMPROBACIONES DE CORRECCION QUE NO SE MIRAN SOLAS.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('la mas antigua a la izquierda y la mas nueva a la derecha', () => {
  it('aunque la API las mande al reves', () => {
    // `/me/progress` ordena por `measured_at DESC`: la primera que llega es la
    // mas NUEVA. Si el grafico la pusiera en x=0, la linea iria del reves.
    const datos = [
      medicion('2026-08-24T08:00:00.000Z', { weightKg: 71 }),
      medicion('2026-07-24T08:00:00.000Z', { weightKg: 72 }),
      medicion('2026-06-24T08:00:00.000Z', { weightKg: 73 }),
    ];
    const c = coordenadasDe(serieDe(datos, 'weightKg'), 300, 140);

    expect(c[0]!.punto.iso).toBe('2026-06-24T08:00:00.000Z');
    expect(c[c.length - 1]!.punto.iso).toBe('2026-08-24T08:00:00.000Z');
    // Y las X van creciendo, sin excepcion.
    for (let i = 1; i < c.length; i++) expect(c[i]!.x).toBeGreaterThan(c[i - 1]!.x);
  });

  it('el instante mas antiguo cae exactamente en x=0 y el mas nuevo en el ancho', () => {
    const datos = [
      medicion('2026-08-24T08:00:00.000Z', { weightKg: 71 }),
      medicion('2026-06-24T08:00:00.000Z', { weightKg: 73 }),
    ];
    const c = coordenadasDe(serieDe(datos, 'weightKg'), 300, 140);
    expect(c[0]!.x).toBe(0);
    expect(c[1]!.x).toBe(300);
  });
});

describe('cuando la medicion mas reciente NO tiene esa medida', () => {
  /*
   * El caso: el 24 de agosto solo se tomo la cintura, y el peso es del 27 de
   * julio. El hero del peso tiene que decir 72,6 kg del 27 de julio, ni un
   * cero ni la fecha del 24.
   */
  const datos = [
    medicion('2026-08-24T08:00:00.000Z', { waistCm: 79 }),
    medicion('2026-07-27T09:00:00.000Z', { weightKg: 72.6 }),
    medicion('2026-06-22T08:45:00.000Z', { weightKg: 73.1 }),
  ];

  it('usa la mas reciente QUE SI la tenga, con SU fecha', () => {
    const resumen = resumenDeMedida(serieDe(datos, 'weightKg'));
    if (resumen.tipo !== 'serie') throw new Error('deberia haber serie');
    expect(resumen.ultimo.valor).toBe(72.6);
    expect(resumen.ultimo.iso).toBe('2026-07-27T09:00:00.000Z');
  });

  it('NO convierte el hueco en cero ni lo cuenta como punto', () => {
    const serie = serieDe(datos, 'weightKg');
    expect(serie).toHaveLength(2);
    expect(serie.map((p) => p.valor)).not.toContain(0);
  });

  it('el cambio se calcula entre las dos que SI la tienen', () => {
    const resumen = resumenDeMedida(serieDe(datos, 'weightKg'));
    if (resumen.tipo !== 'serie') throw new Error('deberia haber serie');
    expect(resumen.cambio.delta).toBeCloseTo(72.6 - 73.1, 5);
    expect(resumen.cambio.isoAnterior).toBe('2026-06-22T08:45:00.000Z');
  });

  it('y "en la ultima medicion" SI usa la mas reciente global, que es otra cosa', () => {
    // Son dos preguntas distintas: "tu peso" es el ultimo peso; "la ultima
    // medicion" es el dia que te midieron. Mezclarlas seria fechar mal el dato.
    expect(medicionMasReciente(datos)?.measuredAt).toBe('2026-08-24T08:00:00.000Z');
    expect(otrasMedidas(datos, 'weightKg').map((o) => o.medida.campo)).toEqual(['waistCm']);
  });
});

describe('lo que oye un lector en el historial', () => {
  it('fecha primero, medidas despues, con comas y no con el punto medio', () => {
    const datos = [medicion('2026-08-24T08:00:00.000Z', { weightKg: 71.4, waistCm: 79 })];
    const fila = historial(datos)[0]!;
    expect(lecturaDeFila(fila, '24 ago 2026')).toBe(
      '24 ago 2026: Peso 71,4 kg, Cintura 79 cm',
    );
  });

  it('una medicion sin medidas se dice como tal, no como una fecha suelta', () => {
    const fila = historial([medicion('2026-08-24T08:00:00.000Z', {})])[0]!;
    expect(lecturaDeFila(fila, '24 ago 2026')).toBe('24 ago 2026: sin medidas registradas');
  });

  it('nunca anuncia un cero por un hueco', () => {
    const datos = [medicion('2026-08-24T08:00:00.000Z', { weightKg: 71.4 })];
    const lectura = lecturaDeFila(historial(datos)[0]!, '24 ago 2026');
    expect(lectura).not.toMatch(/\b0\b/);
    expect(lectura).not.toMatch(/Cintura|Cadera|Pecho|Brazo|Muslo|Grasa/);
  });
});

describe('las fechas del eje', () => {
  it('con pocos puntos, solo el primero y el ultimo', () => {
    expect(referenciasDeTiempo(puntos(1, 2, 3, 4))).toHaveLength(2);
  });

  it('con muchos y repartidos, tres: primera, media y ultima', () => {
    expect(referenciasDeTiempo(puntos(1, 2, 3, 4, 5, 6, 7, 8, 9))).toHaveLength(3);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LO ENCONTRO UNA CAPTURA, NO UNA IDEA.                                   │
   * │                                                                          │
   * │ Los rotulos se reparten a lo ancho: primero a la izquierda, ultimo a la │
   * │ derecha, el de en medio centrado. Con el parón de catorce meses, el     │
   * │ punto "del medio" estaba al 98 % del ancho y su fecha aparecia en el    │
   * │ centro del grafico, donde no habia nada.                                │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('NO rotula una fecha en el centro si su punto no esta en el centro', () => {
    const irregular: readonly Punto[] = [
      { instante: Date.UTC(2025, 5, 11), valor: 84.5, iso: 'a' },
      { instante: Date.UTC(2026, 7, 3), valor: 72.8, iso: 'b' },
      { instante: Date.UTC(2026, 7, 10), valor: 72.3, iso: 'c' },
      { instante: Date.UTC(2026, 7, 17), valor: 71.9, iso: 'd' },
      { instante: Date.UTC(2026, 7, 24), valor: 71.4, iso: 'e' },
    ];
    const refs = referenciasDeTiempo(irregular);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.iso)).toEqual(['a', 'e']);
  });

  it('la del medio se elige por TIEMPO, no por posicion en la lista', () => {
    // Nueve puntos regulares: el central en el tiempo es tambien el quinto.
    const refs = referenciasDeTiempo(puntos(1, 2, 3, 4, 5, 6, 7, 8, 9));
    expect(refs[1]?.valor).toBe(5);
  });

  it('con todos los instantes iguales, solo los extremos', () => {
    const iguales: readonly Punto[] = [1, 2, 3, 4, 5].map((valor) => ({
      instante: 1000,
      valor,
      iso: `p${valor}`,
    }));
    expect(referenciasDeTiempo(iguales)).toHaveLength(2);
  });

  it('nunca etiqueta todos los puntos', () => {
    const serie = puntos(...Array.from({ length: 30 }, (_, i) => i));
    expect(referenciasDeTiempo(serie).length).toBeLessThanOrEqual(3);
  });

  it('con uno solo, ese', () => {
    expect(referenciasDeTiempo(puntos(1))).toHaveLength(1);
  });

  it('sin puntos, ninguna', () => {
    expect(referenciasDeTiempo([])).toEqual([]);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL EJE NO PUEDE ESCONDER UN AÑO.                                        │
 * │                                                                          │
 * │ Lo enseño una captura: la serie del parón iba del 11 de junio de 2025 al │
 * │ 24 de agosto de 2026 y el eje ponia "11 jun" y "24 ago". Se lee como dos │
 * │ meses y medio, y son catorce.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('cuando el eje cruza de año', () => {
  const enUnAnio: readonly Punto[] = [
    { instante: Date.UTC(2026, 4, 25, 12), valor: 70, iso: '2026-05-25T12:00:00.000Z' },
    { instante: Date.UTC(2026, 7, 24, 12), valor: 71, iso: '2026-08-24T12:00:00.000Z' },
  ];
  const entreAnios: readonly Punto[] = [
    { instante: Date.UTC(2025, 5, 11, 12), valor: 84.5, iso: '2025-06-11T12:00:00.000Z' },
    { instante: Date.UTC(2026, 7, 24, 12), valor: 71.4, iso: '2026-08-24T12:00:00.000Z' },
  ];

  it('mismo año: formato compacto, sin repetir el año tres veces', () => {
    expect(cruzanAnios(enUnAnio)).toBe(false);
  });

  it('años distintos: el año tiene que aparecer', () => {
    expect(cruzanAnios(entreAnios)).toBe(true);
  });

  it('un intervalo de mas de doce meses NUNCA puede parecer del mismo año', () => {
    // Catorce meses: por definicion cruza un 1 de enero.
    const catorceMeses: readonly Punto[] = [
      { instante: Date.UTC(2025, 5, 11), valor: 84, iso: '2025-06-11T00:00:00.000Z' },
      { instante: Date.UTC(2026, 7, 11), valor: 71, iso: '2026-08-11T00:00:00.000Z' },
    ];
    expect(cruzanAnios(catorceMeses)).toBe(true);
  });

  it('el 31 de diciembre y el 1 de enero cruzan, aunque sean dos dias', () => {
    const finDeAnio: readonly Punto[] = [
      { instante: Date.UTC(2025, 11, 31, 12), valor: 70, iso: '2025-12-31T12:00:00.000Z' },
      { instante: Date.UTC(2026, 0, 1, 12), valor: 71, iso: '2026-01-01T12:00:00.000Z' },
    ];
    expect(cruzanAnios(finDeAnio)).toBe(true);
  });

  it('con un solo punto no hay rango que cruzar', () => {
    expect(cruzanAnios([enUnAnio[0] as Punto])).toBe(false);
    expect(cruzanAnios([])).toBe(false);
  });

  it('el año se decide en hora LOCAL, como las fechas', () => {
    // Las 23:00 UTC del 31 de diciembre ya son el 1 de enero en Madrid.
    const cruce: readonly Punto[] = [
      { instante: Date.parse('2025-12-31T23:00:00.000Z'), valor: 70, iso: '2025-12-31T23:00:00.000Z' },
      { instante: Date.parse('2026-01-01T10:00:00.000Z'), valor: 71, iso: '2026-01-01T10:00:00.000Z' },
    ];
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Europe/Madrid';
      // Los dos son 2026 en Madrid: no hay año que enseñar.
      expect(cruzanAnios(cruce)).toBe(false);
      process.env.TZ = 'UTC';
      // En UTC son 2025 y 2026: si lo hay.
      expect(cruzanAnios(cruce)).toBe(true);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA SERIE CONSTANTE NO SE ROTULA DOS VECES CON EL MISMO NUMERO.         │
 * │                                                                          │
 * │ La captura ponia "70" arriba y "70" abajo, y parecia una averia. La      │
 * │ linea plana es correcta; lo que sobra son los rotulos.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('la serie constante', () => {
  const constante = puntos(70, 70, 70, 70);

  it('se reconoce como tal', () => {
    expect(serieConstante(constante)).toBe(true);
  });

  it('una serie que se mueve, aunque sea poco, NO es constante', () => {
    expect(serieConstante(puntos(70, 70.1, 70))).toBe(false);
  });

  it('los valores siguen intactos: no se inventa oscilacion', () => {
    expect(constante.map((p) => p.valor)).toEqual([70, 70, 70, 70]);
    const c = coordenadasDe(constante, 300, 140);
    // Todos a la misma altura, y en el centro del lienzo.
    const alturas = new Set(c.map((p) => p.y.toFixed(4)));
    expect(alturas.size).toBe(1);
    expect(c[0]!.y).toBeCloseTo(70, 0);
  });

  it('los dos extremos del eje serian identicos: por eso no se pintan', () => {
    const valores = constante.map((p) => p.valor);
    expect(comoNumero(Math.min(...valores))).toBe(comoNumero(Math.max(...valores)));
  });

  it('el dominio sigue siendo valido: ni NaN, ni division por cero', () => {
    const dominio = dominioDe(constante);
    expect(dominio.max - dominio.min).toBeGreaterThan(0);
    for (const c of coordenadasDe(constante, 300, 140)) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
    }
  });

  it('con un solo punto no se habla de serie constante', () => {
    expect(serieConstante([])).toBe(false);
  });
});

describe('las otras medidas de la ultima medicion', () => {
  const datos = [
    medicion('2026-06-24T08:00:00.000Z', { weightKg: 73, hipCm: 95 }),
    medicion('2026-08-24T08:00:00.000Z', { weightKg: 71, waistCm: 79 }),
  ];

  it('salen de la MAS RECIENTE, no del ultimo elemento del array', () => {
    expect(medicionMasReciente(datos)?.measuredAt).toBe('2026-08-24T08:00:00.000Z');
  });

  it('no mezcla fechas: no arrastra la cadera de hace dos meses', () => {
    const otras = otrasMedidas(datos, 'weightKg');
    expect(otras.map((o) => o.medida.campo)).toEqual(['waistCm']);
  });

  it('se excluye la que ya manda arriba', () => {
    expect(otrasMedidas(datos, 'weightKg').map((o) => o.medida.campo)).not.toContain('weightKg');
  });

  it('sin mediciones, ninguna', () => {
    expect(otrasMedidas([], null)).toEqual([]);
  });
});

describe('el historial', () => {
  it('va de la mas reciente a la mas antigua', () => {
    const datos = [
      medicion('2026-06-24T08:00:00.000Z', { weightKg: 73 }),
      medicion('2026-08-24T08:00:00.000Z', { weightKg: 71 }),
      medicion('2026-07-24T08:00:00.000Z', { weightKg: 72 }),
    ];
    expect(historial(datos).map((f) => f.valores[0]?.valor)).toEqual([71, 72, 73]);
  });

  it('cada fila lleva solo lo que se midio ese dia', () => {
    const datos = [medicion('2026-08-24T08:00:00.000Z', { weightKg: 71, armCm: 32 })];
    expect(historial(datos)[0]?.valores.map((v) => v.medida.campo)).toEqual([
      'weightKg',
      'armCm',
    ]);
  });

  it('una medicion sin ninguna medida deja una fila sin valores, no un cero', () => {
    const datos = [medicion('2026-08-24T08:00:00.000Z', {})];
    expect(historial(datos)[0]?.valores).toEqual([]);
  });
});
