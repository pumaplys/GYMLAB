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

/*
 * Las dos areas que STAFF-1 abre. Se llaman igual que el rol que las abre
 * —recepcion y entrenadora— porque lo que se revisa aqui es a donde va cada
 * rol, no un nombre de pantalla.
 */
const DUENA: Me = {
  user: persona('Dueña de Muestra', 'personal.muestra@ejemplo.local'),
  activeGymId: GIMNASIO_A,
  memberships: [{ gymId: GIMNASIO_A, gymName: 'Gimnasio de Muestra', role: 'owner' }],
} as Me;

const RECEPCION: Me = {
  user: persona('Recepcion de Muestra', 'personal.muestra@ejemplo.local'),
  activeGymId: GIMNASIO_A,
  memberships: [{ gymId: GIMNASIO_A, gymName: 'Gimnasio de Muestra', role: 'receptionist' }],
} as Me;

/** Socia en uno y entrenadora en otro: cambia de AREA al cambiar de gimnasio. */
const SOCIA_Y_ENTRENADORA: Me = {
  user: persona('Socia de Muestra', 'vista.previa@ejemplo.local'),
  activeGymId: null,
  memberships: [
    { gymId: GIMNASIO_A, gymName: 'Gimnasio de Muestra', role: 'member' },
    { gymId: GIMNASIO_B, gymName: 'Gimnasio del Puerto', role: 'trainer' },
  ],
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

/** La sesion con la que se miran las pantallas del Panel: dueña, area panel. */
const PANEL: Caso['estado'] = {
  tipo: 'autenticado',
  yo: DUENA,
  gymId: GIMNASIO_A,
  area: 'panel',
};

/** Y la del area del entrenador. */
const ENTRENADOR: Caso['estado'] = {
  tipo: 'autenticado',
  yo: ENTRENADORA,
  gymId: GIMNASIO_A,
  area: 'entrenador',
};

export const CASOS: Record<string, Caso> = {
  login: { estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  'login-error': { estado: { tipo: 'sinSesion' }, entrada: 'falla401' },
  'login-cargando': {
    estado: { tipo: 'sinSesion' },
    entrada: 'nunca-termina',
  },
  // PARITY-0: las pantallas de antes de la sesion.
  recuperar: { estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  restablecer: { estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  'restablecer-caducado': { estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  'recuperar-error': { estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  'invitacion-existente': { estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  'invitacion-crear': { estado: { tipo: 'sinSesion' }, entrada: 'inerte' },
  'invitacion-entrar': { estado: { tipo: 'sinSesion' }, entrada: 'falla401' },
  'invitacion-vincular': { estado: PANEL, entrada: 'inerte' },
  arranque: { estado: { tipo: 'cargando' }, entrada: 'inerte' },
  autenticado: {
    estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' },
    entrada: 'inerte',
  },
  // --- Las dos areas nuevas de STAFF-1 -----------------------------------
  panel: {
    estado: { tipo: 'autenticado', yo: RECEPCION, gymId: GIMNASIO_A, area: 'panel' },
    entrada: 'inerte',
  },
  entrenador: {
    estado: { tipo: 'autenticado', yo: ENTRENADORA, gymId: GIMNASIO_A, area: 'entrenador' },
    entrada: 'inerte',
  },
  /*
   * STAFF-2: el Panel y su escaner. La sesion es la misma —dueña, area panel—
   * y lo que cambia es lo que devuelven `escaner/camara.web.tsx` y
   * `escaner/fuente.web.ts` para ese mismo `?vista=`.
   */
  'panel-owner': {
    estado: { tipo: 'autenticado', yo: DUENA, gymId: GIMNASIO_A, area: 'panel' },
    entrada: 'inerte',
  },
  'escaner-activo': { estado: PANEL, entrada: 'inerte' },
  'escaner-consultando': { estado: PANEL, entrada: 'inerte' },
  'escaner-permiso': { estado: PANEL, entrada: 'inerte' },
  'escaner-bloqueado': { estado: PANEL, entrada: 'inerte' },
  'escaner-allow': { estado: PANEL, entrada: 'inerte' },
  'escaner-warn': { estado: PANEL, entrada: 'inerte' },
  'escaner-deny': { estado: PANEL, entrada: 'inerte' },
  'escaner-deny-sin-socio': { estado: PANEL, entrada: 'inerte' },
  'escaner-reintento': { estado: PANEL, entrada: 'inerte' },
  'escaner-fallo': { estado: PANEL, entrada: 'inerte' },
  /*
   * STAFF-FINAL. El Panel busca y consulta; el entrenador mira a los suyos.
   * La sesion la fija el AREA —panel o entrenador— y lo que cambia con cada
   * `?vista=` es lo que devuelven `panel/fuente.web.ts` y
   * `entrenador/fuente.web.ts`.
   */
  'panel-buscar': { estado: PANEL, entrada: 'inerte' },
  'panel-buscar-vacio': { estado: PANEL, entrada: 'inerte' },
  'panel-buscar-cargando': { estado: PANEL, entrada: 'inerte' },
  'panel-buscar-error': { estado: PANEL, entrada: 'inerte' },
  'panel-socio': { estado: PANEL, entrada: 'inerte' },
  'panel-socio-por-vencer': { estado: PANEL, entrada: 'inerte' },
  'panel-socio-vencida': { estado: PANEL, entrada: 'inerte' },
  'panel-socio-sin-cuota': { estado: PANEL, entrada: 'inerte' },
  'panel-socio-error': { estado: PANEL, entrada: 'inerte' },
  'trainer-lista': { estado: ENTRENADOR, entrada: 'inerte' },
  'trainer-vacio': { estado: ENTRENADOR, entrada: 'inerte' },
  'trainer-cargando': { estado: ENTRENADOR, entrada: 'inerte' },
  'trainer-error': { estado: ENTRENADOR, entrada: 'inerte' },
  'trainer-socio': { estado: ENTRENADOR, entrada: 'inerte' },
  'trainer-socio-sin-datos': { estado: ENTRENADOR, entrada: 'inerte' },
  'trainer-socio-error': { estado: ENTRENADOR, entrada: 'inerte' },
  /*
   * El selector con DOS AREAS distintas. Es el caso que justifica que la
   * eleccion de gimnasio sea previa al rol: aqui se elige entre ser socia y
   * ser entrenadora, y de esa eleccion sale a que area se va.
   */
  'elegir-gimnasio-dos-areas': {
    estado: {
      tipo: 'requiereSeleccionGimnasio',
      yo: SOCIA_Y_ENTRENADORA,
      opciones: SOCIA_Y_ENTRENADORA.memberships,
    },
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
  'carne-activa': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'carne-expira-pronto': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'carne-vencida': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'carne-congelada': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'carne-expirada': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'carne-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'carne-error': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  // Los estados de Inicio. La sesion es la misma —autenticada— y lo que
  // cambia es lo que devuelve 'inicio/fuente.web.ts' para ese mismo ?vista=.
  'inicio-completo': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'inicio-una-rutina': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'inicio-sin-rutina': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'inicio-sin-progreso': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'inicio-fixture-real': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'inicio-cuota-vencida': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'inicio-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'inicio-error-esencial': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'inicio-error-rutina': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  // Los estados de Rutina. Misma sesion autenticada; lo que cambia es lo que
  // devuelve 'rutina/fuente.web.ts' para ese mismo ?vista=.
  'rutina-una': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-varias': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-nombre-largo': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-nota-larga': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-sin-descanso': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-reps-largas': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-larga': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-fixture-real': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-vacia': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'rutina-error': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  // Los estados de Progreso. Misma sesion autenticada; lo que cambia es lo que
  // devuelve 'progreso/fuente.web.ts' para ese mismo ?vista=.
  'progreso-vacio': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-una': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-dos': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-varias': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-constante': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-intervalos-irregulares': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-casi-igual': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-campos-nulos': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'progreso-error': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  // Perfil y sus tres secciones. Misma sesion autenticada; lo que cambia es lo
  // que devuelve 'perfil/fuente.web.ts' para ese mismo ?vista=.
  'perfil-completo': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'perfil-cuota-problema': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'perfil-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'perfil-error': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'pagos-varios': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'pagos-fixture-real': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'pagos-vacio': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'pagos-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'pagos-error': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'accesos-varios': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'accesos-vacio': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'accesos-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'accesos-error': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'privacidad-activa': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'privacidad-pendiente': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'privacidad-sin-texto': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'privacidad-cargando': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
  'privacidad-error': { estado: { tipo: 'autenticado', yo: SOCIA, gymId: GIMNASIO_A, area: 'socio' }, entrada: 'inerte' },
};

export type { Caso, Entrada } from './tipos';
