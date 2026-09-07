import { describe, expect, it } from 'vitest';
import type { Me, Role } from '@gymlab/contracts';
import { ROLES } from '@gymlab/contracts';
import { AREA_DE_ROL, resolverAcceso } from '../auth/estado';
import { puedeEntrarEnArea } from '../navegacion/destinos';

/**
 * Quien puede escanear un carne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO REPITE LA MATRIZ DE `navegacion/areas.test.ts` A PROPOSITO.        │
 * │                                                                          │
 * │ Alli se prueba el reparto por areas en general; aqui se escribe lo que   │
 * │ el producto pidió PARA EL ESCANER, con esos cuatro nombres. Si alguien   │
 * │ afloja la matriz general, este sigue diciendo exactamente quien puede    │
 * │ abrir la camara y quien no.                                              │
 * │                                                                          │
 * │ Y NO es la unica defensa: la API declara `@Roles('owner',                │
 * │ 'receptionist')` en `POST /gyms/:gymId/access/verify` y ademas exige que │
 * │ el gimnasio de la ruta sea el activo de la sesion. Aunque este gate      │
 * │ fallara, un entrenador recibiria un 403 del servidor. Lo que evita el    │
 * │ gate es pintarle una camara que no le va a servir de nada.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const GIMNASIO = '11111111-1111-4111-8111-111111111111';

function sesionDe(rol: Role) {
  return resolverAcceso({
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Quien Sea',
      email: 'quien@ejemplo.local',
      emailVerified: true,
      isPlatformAdmin: false,
    },
    activeGymId: GIMNASIO,
    memberships: [{ gymId: GIMNASIO, gymName: 'Gimnasio Vista', role: rol }],
  } as Me);
}

/** El escaner vive en `(panel)`, asi que su gate ES el del area panel. */
const puedeEscanear = (rol: Role) => puedeEntrarEnArea(sesionDe(rol), 'panel');

describe('quien puede abrir el escaner', () => {
  it('la dueña, si', () => {
    expect(puedeEscanear('owner')).toBe(true);
  });

  it('recepcion, si', () => {
    expect(puedeEscanear('receptionist')).toBe(true);
  });

  it('el entrenador, NO', () => {
    // Quien controla la puerta es el mostrador. Un entrenador validando
    // accesos no es su trabajo, y la API tampoco se lo permitiria.
    expect(puedeEscanear('trainer')).toBe(false);
  });

  it('un socio, NO', () => {
    // Y este es el importante: validar tu propio QR seria abrirte la puerta.
    expect(puedeEscanear('member')).toBe(false);
  });

  it('exactamente dos de los cuatro roles, ni uno mas', () => {
    // Si mañana aparece un rol nuevo en el contrato, este test dice si se le
    // ha dado acceso a la puerta sin querer.
    const conAcceso = ROLES.filter(puedeEscanear);
    expect([...conAcceso].sort()).toEqual(['owner', 'receptionist']);
  });

  it('y son exactamente los del area panel', () => {
    for (const rol of ROLES) {
      expect(puedeEscanear(rol), rol).toBe(AREA_DE_ROL[rol] === 'panel');
    }
  });
});

describe('un enlace directo al escaner no salta el gate', () => {
  /*
   * El enlace `rinda://escaner` monta `app/(panel)/escaner.tsx`, y para
   * llegar ahi Expo Router monta ANTES `app/(panel)/_layout.tsx`. Esa es toda
   * la defensa, y por eso lo que se comprueba es que el layout diga que no.
   *
   * Los estados sin sesion tambien: un enlace profundo puede llegar con la app
   * arrancando, sin token, o con la sesion caducada.
   */
  it('ningun estado que no sea "panel autenticado" entra', () => {
    const fuera = [
      { tipo: 'cargando' },
      { tipo: 'sinSesion' },
      { tipo: 'rolNoAdmitido', yo: {} as Me },
      { tipo: 'errorAlComprobar', motivo: 'red' },
      { tipo: 'requiereSeleccionGimnasio', yo: {} as Me, opciones: [] },
    ] as const;
    for (const estado of fuera) {
      expect(puedeEntrarEnArea(estado, 'panel'), estado.tipo).toBe(false);
    }
  });

  it('y el de socio y el de entrenador tampoco, aunque esten autenticados', () => {
    expect(puedeEntrarEnArea(sesionDe('member'), 'panel')).toBe(false);
    expect(puedeEntrarEnArea(sesionDe('trainer'), 'panel')).toBe(false);
  });
});
