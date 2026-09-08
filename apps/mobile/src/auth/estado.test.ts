import { describe, expect, it } from 'vitest';
import type { Me } from '@gymlab/contracts';
import type { Membresia } from './estado';
import { ROLES } from '@gymlab/contracts';
import { decidirEstado, gimnasiosDondePuedeEntrar, resolverAcceso } from './estado';

const UNO = '11111111-1111-4111-8111-111111111111';
const DOS = '22222222-2222-4222-8222-222222222222';

type Rol = Membresia['role'];

function yoCon(membresias: Array<[string, Rol]>, activo: string | null): Me {
  return {
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Lucia Fernandez',
      email: 'socia@ejemplo.local',
      emailVerified: true,
      isPlatformAdmin: false,
    },
    activeGymId: activo,
    memberships: membresias.map(([gymId, role]) => ({ gymId, gymName: 'Gimnasio', role })),
  } as Me;
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ROL YA NO DECIDE SI SE ENTRA: DECIDE A DONDE.                        │
 * │                                                                          │
 * │ Estas pruebas se reescribieron enteras en STAFF-1. Antes fijaban que     │
 * │ owner, recepcion y entrenador NO entraban —era el error de alcance— y    │
 * │ ahora fijan a que area va cada uno. Se conservan los mismos casos        │
 * │ frontera, con el resultado nuevo.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('a que area entra cada rol', () => {
  it('socio -> area socio', () => {
    expect(resolverAcceso(yoCon([[UNO, 'member']], UNO))).toEqual({
      tipo: 'autenticado',
      yo: expect.anything(),
      gymId: UNO,
      area: 'socio',
      // PARITY-1: el rol viaja ademas del area. Dentro de `panel` conviven
      // dueño y recepcion, y no pueden lo mismo.
      rol: 'member',
    });
  });

  it('propietario y recepcion -> area panel', () => {
    for (const rol of ['owner', 'receptionist'] as const) {
      const estado = resolverAcceso(yoCon([[UNO, rol]], UNO));
      expect(estado.tipo, rol).toBe('autenticado');
      if (estado.tipo !== 'autenticado') throw new Error('tipo inesperado');
      expect(estado.area, rol).toBe('panel');
    }
  });

  it('entrenador -> area entrenador, que NO es el panel', () => {
    const estado = resolverAcceso(yoCon([[UNO, 'trainer']], UNO));
    if (estado.tipo !== 'autenticado') throw new Error('tipo inesperado');
    expect(estado.area).toBe('entrenador');
  });

  it('los cuatro roles del contrato tienen area, y ninguno se queda fuera', () => {
    for (const rol of ROLES) {
      expect(resolverAcceso(yoCon([[UNO, rol]], UNO)).tipo, rol).toBe('autenticado');
    }
  });

  /*
   * El caso que justifica que el area salga del gimnasio ACTIVO y no de la
   * cuenta: la misma persona cambia de experiencia al cambiar de gimnasio.
   */
  it('manda el gimnasio ACTIVO: socia en uno, entrenadora en otro', () => {
    const membresias: Array<[string, Rol]> = [
      [UNO, 'member'],
      [DOS, 'trainer'],
    ];
    const enUno = resolverAcceso(yoCon(membresias, UNO));
    const enDos = resolverAcceso(yoCon(membresias, DOS));
    if (enUno.tipo !== 'autenticado' || enDos.tipo !== 'autenticado') {
      throw new Error('tipo inesperado');
    }
    expect(enUno.area).toBe('socio');
    expect(enDos.area).toBe('entrenador');
  });
});

describe('sin gimnasio activo: se pregunta, no se adivina', () => {
  it('UN gimnasio como socio y activeGymId null -> requiere seleccion', () => {
    const estado = resolverAcceso(yoCon([[UNO, 'member']], null));
    expect(estado.tipo).toBe('requiereSeleccionGimnasio');
    if (estado.tipo !== 'requiereSeleccionGimnasio') throw new Error('tipo inesperado');
    expect(estado.opciones.map((o) => o.gymId)).toEqual([UNO]);
  });

  it('VARIOS gimnasios como socio y activeGymId null -> requiere seleccion, con todos', () => {
    const estado = resolverAcceso(
      yoCon(
        [
          [UNO, 'member'],
          [DOS, 'member'],
        ],
        null,
      ),
    );
    expect(estado.tipo).toBe('requiereSeleccionGimnasio');
    if (estado.tipo !== 'requiereSeleccionGimnasio') throw new Error('tipo inesperado');
    expect(estado.opciones.map((o) => o.gymId)).toEqual([UNO, DOS]);
  });

  /*
   * Antes de STAFF-1 este caso ofrecia SOLO el gimnasio donde era socia, y el
   * comentario decia "elegirlo le dejaria fuera igualmente". Ya no: ahora
   * elegir el de entrenadora la lleva a su area.
   */
  it('socio en uno y entrenador en otro -> se ofrecen LOS DOS', () => {
    const estado = resolverAcceso(
      yoCon(
        [
          [UNO, 'member'],
          [DOS, 'trainer'],
        ],
        null,
      ),
    );
    expect(estado.tipo).toBe('requiereSeleccionGimnasio');
    if (estado.tipo !== 'requiereSeleccionGimnasio') throw new Error('tipo inesperado');
    expect(estado.opciones.map((o) => o.gymId)).toEqual([UNO, DOS]);
  });

  it('sin activo y siendo SOLO personal -> tambien se le ofrece elegir', () => {
    const estado = resolverAcceso(
      yoCon(
        [
          [UNO, 'trainer'],
          [DOS, 'owner'],
        ],
        null,
      ),
    );
    expect(estado.tipo).toBe('requiereSeleccionGimnasio');
    if (estado.tipo !== 'requiereSeleccionGimnasio') throw new Error('tipo inesperado');
    expect(estado.opciones.map((o) => o.gymId)).toEqual([UNO, DOS]);
  });

  /*
   * El unico caso que sigue sin sitio: una cuenta que no pertenece a ningun
   * gimnasio. Pasa con una cuenta de plataforma, o con una a la que se le
   * retiraron todas las pertenencias.
   */
  it('sin ninguna pertenencia -> rolNoAdmitido', () => {
    expect(resolverAcceso(yoCon([], null)).tipo).toBe('rolNoAdmitido');
  });

  it('un activeGymId que no corresponde a ninguna membresia se trata como sin activo', () => {
    const estado = resolverAcceso(yoCon([[UNO, 'member']], DOS));
    expect(estado.tipo).toBe('requiereSeleccionGimnasio');
  });

  it('NINGUN caso sin gimnasio activo acaba en autenticado por adivinacion', () => {
    // La regla de seleccion automatica es del servidor (auth.service.ts:200):
    // con una sola membresia la fija al entrar. Si llega null, decidio no
    // elegir, y aqui no se le enmienda.
    for (const yo of [
      yoCon([[UNO, 'member']], null),
      yoCon(
        [
          [UNO, 'member'],
          [DOS, 'member'],
        ],
        null,
      ),
    ]) {
      expect(resolverAcceso(yo).tipo).not.toBe('autenticado');
    }
  });
});

describe('gimnasiosDondePuedeEntrar', () => {
  it('devuelve TODAS las pertenencias, no solo las de socio', () => {
    const yo = yoCon(
      [
        [UNO, 'member'],
        [DOS, 'owner'],
      ],
      null,
    );
    expect(gimnasiosDondePuedeEntrar(yo).map((m) => m.gymId)).toEqual([UNO, DOS]);
  });

  it('conserva el orden en el que llegan del servidor', () => {
    const yo = yoCon(
      [
        [DOS, 'trainer'],
        [UNO, 'member'],
      ],
      null,
    );
    expect(gimnasiosDondePuedeEntrar(yo).map((m) => m.gymId)).toEqual([DOS, UNO]);
  });
});

describe('el resultado se traduce a estado', () => {
  it('sin token -> sin sesion', () => {
    expect(decidirEstado({ clase: 'sinToken' }).tipo).toBe('sinSesion');
  });

  it('un "yo" pasa por resolverAcceso', () => {
    const yo = yoCon([[UNO, 'member']], UNO);
    expect(decidirEstado({ clase: 'yo', yo })).toEqual(resolverAcceso(yo));
  });
});
