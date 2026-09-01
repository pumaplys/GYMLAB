import { describe, expect, it } from 'vitest';
import type { Me } from '@gymlab/contracts';
import type { Membresia } from './estado';
import { decidirEstado, membresiasDeSocio, resolverAcceso } from './estado';

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

describe('quien entra en la app movil', () => {
  it('socio con gimnasio activo valido -> autenticado', () => {
    expect(resolverAcceso(yoCon([[UNO, 'member']], UNO))).toEqual({
      tipo: 'autenticado',
      yo: expect.anything(),
      gymId: UNO,
    });
  });

  it('solo entrenador -> rolNoAdmitido, no "credenciales incorrectas"', () => {
    expect(resolverAcceso(yoCon([[UNO, 'trainer']], UNO)).tipo).toBe('rolNoAdmitido');
  });

  it('solo propietario -> rolNoAdmitido', () => {
    expect(resolverAcceso(yoCon([[UNO, 'owner']], UNO)).tipo).toBe('rolNoAdmitido');
  });

  it('manda el gimnasio ACTIVO, no cualquier membresia', () => {
    // Socia en UNO, entrenadora en DOS y con DOS activo: no entra.
    const yo = yoCon(
      [
        [UNO, 'member'],
        [DOS, 'trainer'],
      ],
      DOS,
    );
    expect(resolverAcceso(yo).tipo).toBe('rolNoAdmitido');
  });

  it('un rol futuro o desconocido NO entra por descuido', () => {
    // `member` se comprueba en positivo; cualquier otra cosa se queda fuera.
    const yo = yoCon([[UNO, 'supervisor' as Rol]], UNO);
    expect(resolverAcceso(yo).tipo).toBe('rolNoAdmitido');
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

  it('socio en uno y entrenador en otro, sin activo -> solo se ofrece donde es socio', () => {
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
    // El de entrenador no se ofrece: elegirlo le dejaria fuera igualmente.
    expect(estado.opciones.map((o) => o.gymId)).toEqual([UNO]);
  });

  it('sin activo y sin ninguna membresia de socio -> rolNoAdmitido', () => {
    const estado = resolverAcceso(
      yoCon(
        [
          [UNO, 'trainer'],
          [DOS, 'owner'],
        ],
        null,
      ),
    );
    expect(estado.tipo).toBe('rolNoAdmitido');
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

describe('membresiasDeSocio', () => {
  it('devuelve solo las de rol member', () => {
    const yo = yoCon(
      [
        [UNO, 'member'],
        [DOS, 'owner'],
      ],
      null,
    );
    expect(membresiasDeSocio(yo).map((m) => m.gymId)).toEqual([UNO]);
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
