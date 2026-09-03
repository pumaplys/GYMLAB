/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DATOS DE MUESTRA. NO SON REALES Y NO SALEN DE AQUI.                      │
 * │                                                                          │
 * │ Existen para poder MIRAR las pantallas de M2 en un navegador mientras la │
 * │ validacion en iPhone esta bloqueada. Nada de esto toca la sesion de       │
 * │ verdad: ni token, ni SecureStore, ni red, ni switchGym.                   │
 * │                                                                          │
 * │ Los nombres son deliberadamente ficticios para que ninguna captura pueda  │
 * │ confundirse con una persona real.                                        │
 * │                                                                          │
 * │ La extension .web.ts NO es decorativa: Metro elige este fichero para web │
 * │ y `casos.ts` —vacio— para iOS y Android, asi que estas cadenas NO estan   │
 * │ dentro del binario nativo. Nunca lo importes sin la extension.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { Me } from '@gymlab/contracts';
import type { Caso } from './tipos';

const GIMNASIO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GIMNASIO_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function persona(nombre: string, correo: string): Me['user'] {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: nombre,
    email: correo,
    emailVerified: true,
    isPlatformAdmin: false,
  } as Me['user'];
}

const SOCIA: Me = {
  user: persona('Socia de Muestra', 'vista.previa@ejemplo.local'),
  activeGymId: GIMNASIO_A,
  memberships: [{ gymId: GIMNASIO_A, gymName: 'Gimnasio de Muestra', role: 'member' }],
} as Me;

const ENTRENADORA: Me = {
  user: persona('Entrenadora de Muestra', 'personal.muestra@ejemplo.local'),
  activeGymId: GIMNASIO_A,
  memberships: [{ gymId: GIMNASIO_A, gymName: 'Gimnasio de Muestra', role: 'trainer' }],
} as Me;

const SOCIA_EN_UNO: Me = {
  user: persona('Socia de Muestra', 'vista.previa@ejemplo.local'),
  activeGymId: null,
  memberships: [{ gymId: GIMNASIO_A, gymName: 'Gimnasio de Muestra', role: 'member' }],
} as Me;

const SOCIA_EN_VARIOS: Me = {
  user: persona('Socia de Muestra', 'vista.previa@ejemplo.local'),
  activeGymId: null,
  memberships: [
    { gymId: GIMNASIO_A, gymName: 'Gimnasio de Muestra', role: 'member' },
    { gymId: GIMNASIO_B, gymName: 'Gimnasio de Muestra Norte', role: 'member' },
  ],
} as Me;

export const CASOS: Record<string, Caso> = {
  login: { estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  'login-error': { estado: { tipo: 'sinSesion' }, entrada: 'falla401' },
  'login-cargando': {
    estado: { tipo: 'sinSesion' },
    entrada: 'nunca-termina',
  },
  arranque: { estado: { tipo: 'cargando' }, entrada: 'inerte' },
  autenticado: {
    estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A },
    entrada: 'inerte',
  },
  'no-admitido': {
    estado: { tipo: 'rolNoAdmitido', yo: ENTRENADORA },
    entrada: 'inerte',
  },
  problema: {
    estado: { tipo: 'errorAlComprobar', motivo: 'red' },
    entrada: 'inerte',
  },
  'selector-uno': {
    estado: {
      tipo: 'requiereSeleccionGimnasio',
      yo: SOCIA_EN_UNO,
      opciones: SOCIA_EN_UNO.memberships,
    },
    entrada: 'inerte',
  },
  'selector-varios': {
    estado: {
      tipo: 'requiereSeleccionGimnasio',
      yo: SOCIA_EN_VARIOS,
      opciones: SOCIA_EN_VARIOS.memberships,
    },
    entrada: 'inerte',
  },
  // Los estados del carne. La sesion es la misma —autenticada— y lo que
  // cambia es lo que devuelve `carne/fuente.web.ts` para ese mismo `?vista=`.
  'carne-activa': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'carne-expira-pronto': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'carne-vencida': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'carne-congelada': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'carne-expirada': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'carne-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'carne-error': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  // Los estados de Inicio. La sesion es la misma —autenticada— y lo que
  // cambia es lo que devuelve 'inicio/fuente.web.ts' para ese mismo ?vista=.
  'inicio-completo': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'inicio-una-rutina': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'inicio-sin-rutina': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'inicio-sin-progreso': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'inicio-cuota-vencida': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'inicio-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'inicio-error-esencial': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
  'inicio-error-rutina': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A }, entrada: 'inerte' },
};

export type { Caso, Entrada } from './tipos';
