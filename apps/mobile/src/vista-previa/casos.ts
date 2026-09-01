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
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { Me } from '@gymlab/contracts';
import type { EstadoDeSesion } from '../auth/estado';

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

/** Que pantalla monta cada caso. */
export type Pantalla =
  | 'entrar'
  | 'arranque'
  | 'sesion-lista'
  | 'no-admitido'
  | 'problema'
  | 'elegir-gimnasio';

/** Como se comporta `entrar()` en este caso, para poder ver error y carga. */
export type Entrada = 'inerte' | 'falla401' | 'nunca-termina';

export interface Caso {
  pantalla: Pantalla;
  estado: EstadoDeSesion;
  entrada: Entrada;
}

export const CASOS: Record<string, Caso> = {
  login: { pantalla: 'entrar', estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  'login-error': { pantalla: 'entrar', estado: { tipo: 'sinSesion' }, entrada: 'falla401' },
  'login-cargando': {
    pantalla: 'entrar',
    estado: { tipo: 'sinSesion' },
    entrada: 'nunca-termina',
  },
  arranque: { pantalla: 'arranque', estado: { tipo: 'cargando' }, entrada: 'inerte' },
  'sesion-lista': {
    pantalla: 'sesion-lista',
    estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A },
    entrada: 'inerte',
  },
  'no-admitido': {
    pantalla: 'no-admitido',
    estado: { tipo: 'rolNoAdmitido', yo: ENTRENADORA },
    entrada: 'inerte',
  },
  problema: {
    pantalla: 'problema',
    estado: { tipo: 'errorAlComprobar', motivo: 'red' },
    entrada: 'inerte',
  },
  'selector-uno': {
    pantalla: 'elegir-gimnasio',
    estado: {
      tipo: 'requiereSeleccionGimnasio',
      yo: SOCIA_EN_UNO,
      opciones: SOCIA_EN_UNO.memberships,
    },
    entrada: 'inerte',
  },
  'selector-varios': {
    pantalla: 'elegir-gimnasio',
    estado: {
      tipo: 'requiereSeleccionGimnasio',
      yo: SOCIA_EN_VARIOS,
      opciones: SOCIA_EN_VARIOS.memberships,
    },
    entrada: 'inerte',
  },
};
