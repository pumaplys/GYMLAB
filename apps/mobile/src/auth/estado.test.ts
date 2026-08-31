import { describe, expect, it } from 'vitest';
import type { Me } from '@gymlab/contracts';
import { debeBorrarToken, decidirEstado, membresiaDeSocio } from './estado';

const GIMNASIO = '11111111-1111-4111-8111-111111111111';
const OTRO = '22222222-2222-4222-8222-222222222222';

function yoCon(
  membresias: Array<{ gymId: string; role: 'owner' | 'receptionist' | 'trainer' | 'member' }>,
  activo: string | null = GIMNASIO,
): Me {
  return {
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Lucia Fernandez',
      email: 'socia@ejemplo.local',
      emailVerified: true,
      isPlatformAdmin: false,
    },
    activeGymId: activo,
    memberships: membresias.map((m) => ({ gymId: m.gymId, gymName: 'Gimnasio', role: m.role })),
  } as Me;
}

describe('quien puede usar la app movil', () => {
  it('un socio del gimnasio activo entra', () => {
    const estado = decidirEstado({ clase: 'yo', yo: yoCon([{ gymId: GIMNASIO, role: 'member' }]) });
    expect(estado).toEqual({
      tipo: 'autenticado',
      yo: expect.anything(),
      gymId: GIMNASIO,
    });
  });

  it('un entrenador NO entra, y no se le dice que sus credenciales fallan', () => {
    const estado = decidirEstado({ clase: 'yo', yo: yoCon([{ gymId: GIMNASIO, role: 'trainer' }]) });
    expect(estado.tipo).toBe('rolNoAdmitido');
  });

  it('un propietario NO entra', () => {
    const estado = decidirEstado({ clase: 'yo', yo: yoCon([{ gymId: GIMNASIO, role: 'owner' }]) });
    expect(estado.tipo).toBe('rolNoAdmitido');
  });

  it('manda el gimnasio ACTIVO, no cualquier membresia que tenga', () => {
    // Socia en un gimnasio, entrenadora en el activo: no entra.
    const yo = yoCon(
      [
        { gymId: OTRO, role: 'member' },
        { gymId: GIMNASIO, role: 'trainer' },
      ],
      GIMNASIO,
    );
    expect(membresiaDeSocio(yo)).toBeNull();
    expect(decidirEstado({ clase: 'yo', yo }).tipo).toBe('rolNoAdmitido');
  });

  it('sin gimnasio activo no se puede decidir, y no se deja entrar', () => {
    const yo = yoCon([{ gymId: GIMNASIO, role: 'member' }], null);
    expect(decidirEstado({ clase: 'yo', yo }).tipo).toBe('rolNoAdmitido');
  });
});

describe('sesion invalida contra servidor inaccesible', () => {
  it('sin token guardado: sin sesion', () => {
    expect(decidirEstado({ clase: 'sinToken' }).tipo).toBe('sinSesion');
  });

  it('401: sin sesion', () => {
    expect(decidirEstado({ clase: 'noAutorizado' }).tipo).toBe('sinSesion');
  });

  it('error de red: sinConexion, que NO es lo mismo que sin sesion', () => {
    expect(decidirEstado({ clase: 'errorDeRed' }).tipo).toBe('sinConexion');
  });

  it('solo un 401 borra el token', () => {
    expect(debeBorrarToken({ clase: 'noAutorizado' })).toBe(true);
  });

  it('un error de RED NO borra el token', () => {
    // La regla que evita que pasar por un tunel te eche de la app.
    expect(debeBorrarToken({ clase: 'errorDeRed' })).toBe(false);
  });

  it('tampoco lo borra un arranque sin token ni una sesion valida', () => {
    expect(debeBorrarToken({ clase: 'sinToken' })).toBe(false);
    expect(
      debeBorrarToken({ clase: 'yo', yo: yoCon([{ gymId: GIMNASIO, role: 'member' }]) }),
    ).toBe(false);
  });
});
