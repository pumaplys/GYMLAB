import { describe, expect, it } from 'vitest';
import type { AssignedMember, AssignedRoutine, BodyMetric } from '@gymlab/contracts';
import {
  lineaDeAsignado,
  lineaDeRutina,
  nombreDelAsignado,
  ordenados,
  recuentoDeSocios,
  ultimaMedicion,
  valoresDeMedicion,
} from './logica';

function asignado(parcial: Partial<AssignedMember> = {}): AssignedMember {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    memberNumber: 128,
    firstName: 'Nombre',
    lastName: 'Apellido',
    email: null,
    phone: null,
    birthDate: null,
    status: 'active',
    joinedAt: '2026-01-10',
    leftAt: null,
    hasAccount: false,
    assignmentId: '11111111-1111-4111-8111-111111111111',
    assignedAt: '2026-05-04',
    ...parcial,
  } as AssignedMember;
}

function medicion(parcial: Partial<BodyMetric> = {}): BodyMetric {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    measuredAt: '2026-08-28T09:15:00.000Z',
    weightKg: null,
    bodyFatPercent: null,
    chestCm: null,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    notes: null,
    consentVersion: '1',
    ...parcial,
  } as BodyMetric;
}

describe('la lista de socios asignados', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL SERVIDOR NO PROMETE ORDEN, ASI QUE SE ORDENA AQUI.                │
   * │                                                                      │
   * │ Una lista que baila entre dos cargas obliga a releerla entera cada    │
   * │ vez. Se ordena por apellido y despues por nombre, que es como se      │
   * │ busca a alguien con el pulgar.                                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('se ordena por apellido y luego por nombre', () => {
    const lista = ordenados([
      asignado({ id: '1', firstName: 'Zoe', lastName: 'Ruiz' }),
      asignado({ id: '2', firstName: 'Ana', lastName: 'Ruiz' }),
      asignado({ id: '3', firstName: 'Beto', lastName: 'Antunez' }),
    ]);
    expect(lista.map((s) => `${s.lastName} ${s.firstName}`)).toEqual([
      'Antunez Beto',
      'Ruiz Ana',
      'Ruiz Zoe',
    ]);
  });

  it('las tildes y la Ñ caen donde tienen que caer', () => {
    // Con una comparacion de cadenas cruda, «Álvarez» se iria al final y «Ñ»
    // detras de la Z. `localeCompare` con 'es' es lo que lo arregla.
    const lista = ordenados([
      asignado({ id: '1', lastName: 'Zurita' }),
      asignado({ id: '2', lastName: 'Álvarez' }),
      asignado({ id: '3', lastName: 'Núñez' }),
      asignado({ id: '4', lastName: 'Nogal' }),
    ]);
    expect(lista.map((s) => s.lastName)).toEqual(['Álvarez', 'Nogal', 'Núñez', 'Zurita']);
  });

  it('no toca la lista original', () => {
    const original = [asignado({ id: '1', lastName: 'Z' }), asignado({ id: '2', lastName: 'A' })];
    ordenados(original);
    expect(original.map((s) => s.lastName)).toEqual(['Z', 'A']);
  });

  it('el recuento se dice en singular cuando es uno', () => {
    expect(recuentoDeSocios(1)).toBe('1 socio asignado');
    expect(recuentoDeSocios(0)).toBe('0 socios asignados');
    expect(recuentoDeSocios(12)).toBe('12 socios asignados');
  });

  it('la fila lleva el numero de socio, y avisa de la baja', () => {
    expect(lineaDeAsignado(asignado({ memberNumber: 7 }))).toEqual({
      titulo: 'Nombre Apellido',
      detalle: 'nº 7',
    });
    expect(lineaDeAsignado(asignado({ status: 'inactive' })).detalle).toBe('nº 128 · de baja');
    expect(nombreDelAsignado(asignado({ lastName: '' }))).toBe('Nombre');
  });
});

describe('la rutina que sigue', () => {
  const rutina = (parcial: Partial<AssignedRoutine> = {}) =>
    ({
      id: 'r1',
      name: 'Fuerza',
      description: null,
      items: [{}, {}, {}],
      activeAssignments: 2,
      status: 'active',
      assignmentId: 'a1',
      assignedAt: '2026-07-01',
      ...parcial,
    }) as AssignedRoutine;

  it('se resume con el nombre, cuantos ejercicios y desde cuando', () => {
    expect(lineaDeRutina(rutina(), (iso) => `[${iso}]`)).toEqual({
      titulo: 'Fuerza',
      detalle: '3 ejercicios · desde el [2026-07-01]',
    });
  });

  it('un solo ejercicio se dice en singular', () => {
    expect(lineaDeRutina(rutina({ items: [{}] as never }), (i) => i).detalle).toMatch(
      /^1 ejercicio ·/,
    );
  });
});

describe('la ultima medicion', () => {
  it('sin mediciones, no hay ultima', () => {
    expect(ultimaMedicion([])).toBeNull();
  });

  /*
   * El servidor la devuelve ordenada de mas nueva a mas vieja, pero eso NO esta
   * en el contrato. Se busca el maximo para no depender de algo que nadie
   * prometio: si un dia cambia el `order by`, esta pantalla sigue bien.
   */
  it('se coge la mas reciente aunque la lista venga desordenada', () => {
    const vieja = medicion({ id: 'v', measuredAt: '2026-05-01T10:00:00.000Z', weightKg: 70 });
    const nueva = medicion({ id: 'n', measuredAt: '2026-08-28T09:15:00.000Z', weightKg: 66 });
    expect(ultimaMedicion([vieja, nueva])?.id).toBe('n');
    expect(ultimaMedicion([nueva, vieja])?.id).toBe('n');
  });
});

describe('los valores de una medicion', () => {
  it('solo salen los que se midieron', () => {
    // Todas las medidas son opcionales: se apunta lo que se tomo. Pintar
    // «Cintura: —» en una medicion de solo peso llenaria la ficha de huecos.
    const valores = valoresDeMedicion(medicion({ weightKg: 63.4, waistCm: 71 }));
    expect(valores).toEqual([
      { etiqueta: 'Peso', valor: '63.4 kg' },
      { etiqueta: 'Cintura', valor: '71 cm' },
    ]);
  });

  it('una medicion sin ningun valor no produce filas', () => {
    expect(valoresDeMedicion(medicion())).toEqual([]);
  });

  it('salen en el orden fijado, no en el del objeto', () => {
    const valores = valoresDeMedicion(
      medicion({ thighCm: 55, weightKg: 70, bodyFatPercent: 20, armCm: 30 }),
    );
    expect(valores.map((v) => v.etiqueta)).toEqual(['Peso', 'Grasa', 'Brazo', 'Muslo']);
  });

  it('NO se enseñan las notas ni la version del consentimiento', () => {
    /*
     * `notes` puede llevar texto libre escrito por quien midio, y
     * `consentVersion` es un dato interno de cumplimiento. Ninguno de los dos
     * es un valor que mirar de pie en la sala.
     */
    const valores = valoresDeMedicion(
      medicion({ weightKg: 70, notes: 'algo privado', consentVersion: '3' }),
    );
    const texto = JSON.stringify(valores);
    expect(texto).not.toContain('algo privado');
    expect(valores.map((v) => v.etiqueta)).not.toContain('Notas');
  });
});
