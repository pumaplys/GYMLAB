import type { GymStaffMember, Invitation, MemberTrainer, Role, Trainer } from '@gymlab/contracts';
import { CAN_INVITE, ROLES } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  NOMBRE_DEL_ESTADO,
  NOMBRE_DEL_ROL,
  ROLES_DE_PERSONAL,
  entrenadoresAsignables,
  estadoDeInvitacion,
  lineaDeEntrenadorDelSocio,
  lineaDePersonal,
  rolesQuePuedeInvitar,
  sePuedeRevocar,
  soloPersonal,
} from './logica';
import {
  puedeAsignarEntrenadores,
  puedeGestionarInvitaciones,
  puedeInvitarConRol,
  puedeRetirarAcceso,
  puedeVerElPersonal,
} from './permisos';
import { fechaCivil } from '../formato/fecha';

const invitacion = (parcial: Partial<Invitation>): Invitation => ({
  id: 'i1',
  email: 'alguien@ejemplo.local',
  role: 'trainer',
  expiresAt: '2026-12-31T00:00:00.000Z',
  acceptedAt: null,
  revokedAt: null,
  ...parcial,
});

describe('quien es «personal»', () => {
  /*
   * No hay ningun rol `staff` en el contrato. Personal son tres roles, y los
   * socios se gestionan desde su ficha.
   */
  it('son dueño, recepcion y entrenador; el socio no', () => {
    expect([...ROLES_DE_PERSONAL].sort()).toEqual(['owner', 'receptionist', 'trainer']);
    expect(ROLES_DE_PERSONAL).not.toContain('member');
  });

  it('la lista se filtra a esos tres', () => {
    const gente = [
      { role: 'owner' as Role, n: 1 },
      { role: 'member' as Role, n: 2 },
      { role: 'trainer' as Role, n: 3 },
    ];
    expect(soloPersonal(gente).map((g) => g.n)).toEqual([1, 3]);
  });

  it('ningun rol del contrato se queda sin nombre en castellano', () => {
    for (const rol of ROLES) {
      expect(NOMBRE_DEL_ROL[rol], rol).toBeTruthy();
      expect(NOMBRE_DEL_ROL[rol]).not.toBe(rol);
    }
  });

  it('la segunda linea dice que es y desde cuando', () => {
    const persona = {
      userId: 'u1',
      name: 'Alguien',
      email: 'a@b.local',
      role: 'receptionist',
      joinedAt: '2026-03-04',
    } as GymStaffMember;
    expect(lineaDePersonal(persona, fechaCivil)).toBe('Recepción · desde el 4 mar 2026');
  });
});

describe('a quien puede invitar quien', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ES CONTROL DE ESCALADA DE PRIVILEGIOS, Y NO SE COPIA.                │
   * │                                                                      │
   * │ `CAN_INVITE` vive en el contrato para que cliente y servidor apliquen │
   * │ la MISMA matriz. Si el movil la reescribiera, el dia que cambiara una │
   * │ de las dos habria una pantalla ofreciendo lo que el servidor rechaza  │
   * │ — o, peor, al reves.                                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('sale de `CAN_INVITE` del contrato, acotado a personal', () => {
    for (const rol of ROLES) {
      const esperado = CAN_INVITE[rol].filter((r) => ROLES_DE_PERSONAL.includes(r));
      expect(rolesQuePuedeInvitar(rol), rol).toEqual(esperado);
    }
  });

  it('el dueño puede invitar a los tres', () => {
    expect(rolesQuePuedeInvitar('owner').sort()).toEqual(['owner', 'receptionist', 'trainer']);
  });

  /*
   * Recepcion gestiona personal cuando el dueño no esta, de ahi que pueda
   * invitar entrenadores. NUNCA un dueño: eso seria escalada de privilegios.
   */
  it('recepcion puede invitar entrenadores, y NUNCA un dueño', () => {
    expect(rolesQuePuedeInvitar('receptionist')).toEqual(['trainer']);
    expect(puedeInvitarConRol('receptionist', 'owner')).toBe(false);
    expect(puedeInvitarConRol('receptionist', 'trainer')).toBe(true);
  });

  it('el entrenador y el socio no invitan a nadie', () => {
    expect(rolesQuePuedeInvitar('trainer')).toEqual([]);
    expect(rolesQuePuedeInvitar('member')).toEqual([]);
  });
});

describe('el estado de una invitacion', () => {
  const AHORA = new Date('2026-09-08T12:00:00.000Z');

  it('pendiente mientras no caduque ni se toque', () => {
    expect(estadoDeInvitacion(invitacion({}), AHORA)).toBe('pendiente');
    expect(sePuedeRevocar(invitacion({}), AHORA)).toBe(true);
  });

  it('caducada cuando pasa su fecha', () => {
    const vieja = invitacion({ expiresAt: '2026-09-01T00:00:00.000Z' });
    expect(estadoDeInvitacion(vieja, AHORA)).toBe('caducada');
    expect(sePuedeRevocar(vieja, AHORA)).toBe(false);
  });

  it('revocada y aceptada mandan sobre la fecha', () => {
    expect(estadoDeInvitacion(invitacion({ revokedAt: '2026-09-02' }), AHORA)).toBe('revocada');
    expect(estadoDeInvitacion(invitacion({ acceptedAt: '2026-09-02' }), AHORA)).toBe('aceptada');
  });

  /*
   * Una aceptada que ademas caduco sigue siendo aceptada: lo que importa es
   * que alguien la uso. Con el orden al reves diria «caducada» sobre una
   * invitacion que si funciono.
   */
  it('una aceptada que ademas caduco sigue siendo aceptada', () => {
    const caso = invitacion({ acceptedAt: '2026-08-20', expiresAt: '2026-08-25T00:00:00.000Z' });
    expect(estadoDeInvitacion(caso, AHORA)).toBe('aceptada');
    expect(sePuedeRevocar(caso, AHORA)).toBe(false);
  });

  it('solo se ofrece revocar lo que sigue vivo', () => {
    for (const muerta of [
      invitacion({ acceptedAt: '2026-09-02' }),
      invitacion({ revokedAt: '2026-09-02' }),
      invitacion({ expiresAt: '2026-09-01T00:00:00.000Z' }),
    ]) {
      expect(sePuedeRevocar(muerta, AHORA)).toBe(false);
    }
  });

  it('cada estado tiene su palabra', () => {
    for (const estado of ['aceptada', 'revocada', 'caducada', 'pendiente'] as const) {
      expect(NOMBRE_DEL_ESTADO[estado], estado).toBeTruthy();
    }
  });
});

const entrenador = (parcial: Partial<Trainer>): Trainer =>
  ({
    id: 't1',
    name: 'Entrenadora',
    email: 'e@ejemplo.local',
    bio: null,
    phone: null,
    status: 'active',
    activeMembers: 3,
    createdAt: '2026-01-01',
    ...parcial,
  }) as Trainer;

const asignado = (parcial: Partial<MemberTrainer>): MemberTrainer => ({
  assignmentId: 'a1',
  trainerId: 't1',
  name: 'Entrenadora',
  status: 'active',
  assignedAt: '2026-05-04',
  ...parcial,
});

describe('los entrenadores de un socio', () => {
  const TODOS = [
    entrenador({ id: 't1', name: 'Zoe' }),
    entrenador({ id: 't2', name: 'Ana' }),
    entrenador({ id: 't3', name: 'De baja', status: 'inactive' }),
  ];

  /*
   * Los dos motivos para dejar uno fuera los impone el servidor: estar de baja
   * y estar ya asignado.
   */
  it('ni los de baja ni los que ya lleva', () => {
    const libres = entrenadoresAsignables(TODOS, [asignado({ trainerId: 't1' })]);
    expect(libres.map((t) => t.id)).toEqual(['t2']);
  });

  it('sin ninguno asignado, salen todos los activos por nombre', () => {
    expect(entrenadoresAsignables(TODOS, []).map((t) => t.id)).toEqual(['t2', 't1']);
  });

  /*
   * Un entrenador que se da de baja DESPUES de asignarlo sigue asignado. No se
   * esconde: hay que poder verlo para decidir si se retira.
   */
  it('uno ya asignado que esta de baja se enseña, diciendolo', () => {
    const linea = lineaDeEntrenadorDelSocio(asignado({ status: 'inactive' }), fechaCivil);
    expect(linea.titulo).toBe('Entrenadora');
    expect(linea.detalle).toMatch(/de baja/);
  });

  it('y uno activo solo dice desde cuando', () => {
    expect(lineaDeEntrenadorDelSocio(asignado({}), fechaCivil).detalle).toBe('Desde el 4 may 2026');
  });
});

describe('quien puede que', () => {
  const TODOS: Role[] = ['owner', 'receptionist', 'trainer', 'member'];

  it('ver el personal e invitar son de dueño y recepcion', () => {
    expect(TODOS.filter(puedeVerElPersonal)).toEqual(['owner', 'receptionist']);
    expect(TODOS.filter(puedeGestionarInvitaciones)).toEqual(['owner', 'receptionist']);
    expect(TODOS.filter(puedeAsignarEntrenadores)).toEqual(['owner', 'receptionist']);
  });

  /*
   * «Ver la lista no da poder sobre ella»: recepcion ve quien trabaja aqui y no
   * puede retirarle el acceso a nadie. Lo dice el controlador con esas palabras.
   */
  it('retirar el acceso es SOLO del dueño', () => {
    expect(TODOS.filter(puedeRetirarAcceso)).toEqual(['owner']);
  });

  it('el entrenador no gestiona personal', () => {
    expect(puedeVerElPersonal('trainer')).toBe(false);
    expect(puedeAsignarEntrenadores('trainer')).toBe(false);
  });
});
