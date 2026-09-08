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
import type { Me, Role } from '@gymlab/contracts';
import { AREA_DE_ROL } from '../auth/estado';
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

/**
 * Una sesion de muestra a partir del ROL.
 *
 * El area NO se escribe: se deriva con `AREA_DE_ROL`, que es lo que hace
 * `resolverAcceso` de verdad. Escribirlas a mano permitia una pareja
 * imposible —rol `receptionist` con area `entrenador`— que compilaba.
 */
function sesionDe(yo: Me, rol: Role): Caso['estado'] {
  return { tipo: 'autenticado', yo, gymId: GIMNASIO_A, area: AREA_DE_ROL[rol], rol };
}

/** La sesion con la que se miran las pantallas del Panel: dueña, area panel. */
const PANEL: Caso['estado'] = sesionDe(DUENA, 'owner');

/** Y la del area del entrenador. */
const ENTRENADOR: Caso['estado'] = sesionDe(ENTRENADORA, 'trainer');

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
    estado: sesionDe(SOCIA, 'member'),
    entrada: 'inerte',
  },
  // --- Las dos areas nuevas de STAFF-1 -----------------------------------
  panel: {
    estado: sesionDe(RECEPCION, 'receptionist'),
    entrada: 'inerte',
  },
  entrenador: {
    estado: sesionDe(ENTRENADORA, 'trainer'),
    entrada: 'inerte',
  },
  /*
   * STAFF-2: el Panel y su escaner. La sesion es la misma —dueña, area panel—
   * y lo que cambia es lo que devuelven `escaner/camara.web.tsx` y
   * `escaner/fuente.web.ts` para ese mismo `?vista=`.
   */
  'panel-owner': {
    estado: sesionDe(DUENA, 'owner'),
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
  'carne-activa': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'carne-expira-pronto': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'carne-vencida': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'carne-congelada': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'carne-expirada': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'carne-cargando': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'carne-error': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  // Los estados de Inicio. La sesion es la misma —autenticada— y lo que
  // cambia es lo que devuelve 'inicio/fuente.web.ts' para ese mismo ?vista=.
  'inicio-completo': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'inicio-una-rutina': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'inicio-sin-rutina': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'inicio-sin-progreso': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'inicio-fixture-real': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'inicio-cuota-vencida': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'inicio-cargando': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'inicio-error-esencial': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'inicio-error-rutina': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  // Los estados de Rutina. Misma sesion autenticada; lo que cambia es lo que
  // devuelve 'rutina/fuente.web.ts' para ese mismo ?vista=.
  'rutina-una': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-varias': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-nombre-largo': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-nota-larga': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-sin-descanso': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-reps-largas': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-larga': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-fixture-real': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-vacia': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-cargando': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'rutina-error': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  // Los estados de Progreso. Misma sesion autenticada; lo que cambia es lo que
  // devuelve 'progreso/fuente.web.ts' para ese mismo ?vista=.
  'progreso-vacio': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-una': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-dos': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-varias': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-constante': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-intervalos-irregulares': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-casi-igual': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-campos-nulos': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-cargando': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'progreso-error': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  // Perfil y sus tres secciones. Misma sesion autenticada; lo que cambia es lo
  // que devuelve 'perfil/fuente.web.ts' para ese mismo ?vista=.
  'perfil-completo': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'perfil-cuota-problema': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'perfil-cargando': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'perfil-error': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'pagos-varios': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'pagos-fixture-real': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'pagos-vacio': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'pagos-cargando': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'pagos-error': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'accesos-varios': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'accesos-vacio': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'accesos-cargando': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'accesos-error': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'privacidad-activa': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'privacidad-pendiente': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'privacidad-sin-texto': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'privacidad-cargando': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },
  'privacidad-error': { estado: sesionDe(SOCIA, 'member'), entrada: 'inerte' },

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ PARITY-1. AQUI LA SESION SI IMPORTA, Y MUCHO.                        │
   * │                                                                      │
   * │ En las demas pantallas la sesion es decorado: lo que cambia entre     │
   * │ casos es lo que devuelve la fuente. Aqui el ROL decide si se entra    │
   * │ siquiera: entrenamiento es de dueño y entrenador, y recepcion —que    │
   * │ comparte area con el dueño— tiene que rebotar.                        │
   * │                                                                      │
   * │ Por eso hay un caso con RECEPCION: es el control negativo del gate.   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  'entrenamiento-biblioteca': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-vacio': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-cargando': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-error': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-rutinas': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-rutinas-vacio': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-rutina': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-rutina-archivada': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-editor': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  /* Una rutina rota por un borrado ajeno, para poder ver «Elegir sustituto». */
  'entrenamiento-rutina-huerfana': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'entrenamiento-asignar': { estado: sesionDe(ENTRENADORA, 'trainer'), entrada: 'inerte' },
  'entrenamiento-socio-sin-rutinas': { estado: sesionDe(ENTRENADORA, 'trainer'), entrada: 'inerte' },
  /* El servidor dice que no: la rutina la creo otro entrenador. */
  'entrenamiento-archivar-ajena': { estado: sesionDe(ENTRENADORA, 'trainer'), entrada: 'inerte' },
  /* El control negativo: recepcion no entra en entrenamiento. */
  'entrenamiento-recepcion': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ PARITY-2. EL MOSTRADOR, Y AQUI EL ROL TAMBIEN DECIDE.                │
   * │                                                                      │
   * │ Socios, cuotas y cobros los comparten dueño y recepcion; exportar,    │
   * │ eliminar, anular un pago y tocar los planes son SOLO del dueño. Por   │
   * │ eso cada caso dice con que rol se mira: los pares `-recepcion` son el │
   * │ control negativo de esas cuatro.                                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  'mostrador-alta': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-alta-error': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-ficha': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'mostrador-ficha-recepcion': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-cuota-al-corriente': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-cuota-pausada': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-cuota-vencida': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-sin-cuota': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-pagos': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'mostrador-pagos-recepcion': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-sin-pagos': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'mostrador-planes': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'mostrador-planes-recepcion': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'mostrador-sin-planes': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ PARITY-3. ACCESOS, PERSONAL, INVITACIONES Y ENTRENADORES.            │
   * │                                                                      │
   * │ Casi todo lo comparten dueño y recepcion. Lo que NO: retirar el       │
   * │ acceso a alguien del personal, que es del dueño, y a quien se puede   │
   * │ invitar, que lo decide `CAN_INVITE` —recepcion no crea dueños—.       │
   * │ Los pares `-recepcion` son el control negativo de las dos cosas.      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  'equipo-accesos': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'equipo-accesos-vacio': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'equipo-accesos-cargando': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'equipo-accesos-error': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'equipo-personal': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'equipo-personal-recepcion': { estado: sesionDe(RECEPCION, 'receptionist'), entrada: 'inerte' },
  'equipo-sin-invitaciones': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'equipo-invitar-existente': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'equipo-error': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'equipo-entrenadores': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
  'equipo-socio-sin-entrenador': { estado: sesionDe(DUENA, 'owner'), entrada: 'inerte' },
};

export type { Caso, Entrada } from './tipos';
