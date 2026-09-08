import type { Exercise, Role, Routine } from '@gymlab/contracts';
import { createExerciseSchema } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  asignables,
  ejercicioAEnvio,
  filtrarEjercicios,
  GRUPOS,
  lineaDeEjercicio,
  lineaDeRutina,
  NOMBRE_DEL_GRUPO,
  ordenarRutinas,
} from './biblioteca';
import { puedeAsignarRutinas, puedeEditarEjercicios, puedeEntrenar, tieneSentidoArchivar } from './permisos';
// La misma comparacion que en el editor: si el panel y el movil filtran
// distinto, la misma biblioteca se busca distinta en cada sitio.
import { filtrarEjercicios as filtrarWeb, NOMBRE_DEL_GRUPO as GRUPOS_WEB } from '../../../web/src/lib/ejercicios';

const ej = (parcial: Partial<Exercise>): Exercise => ({
  id: 'e1',
  name: 'Press de banca',
  muscleGroup: 'chest',
  equipment: 'Barra',
  fromTemplate: true,
  ...parcial,
});

const BIBLIOTECA: Exercise[] = [
  ej({}),
  ej({ id: 'e2', name: 'Remo con barra', muscleGroup: 'back' }),
  ej({ id: 'e3', name: 'Plancha', muscleGroup: 'core', equipment: null }),
];

describe('buscar en la biblioteca', () => {
  /*
   * Tres formas de buscar un ejercicio, y las tres son la misma casilla: por
   * como se llama, por con que se hace y por que trabaja. La plantilla siembra
   * mas de sesenta, asi que recorrerlos a ojo no es una opcion.
   */
  it('encuentra por nombre, por material y por grupo muscular', () => {
    expect(filtrarEjercicios(BIBLIOTECA, 'remo').map((e) => e.id)).toEqual(['e2']);
    expect(filtrarEjercicios(BIBLIOTECA, 'barra').map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(filtrarEjercicios(BIBLIOTECA, 'core').map((e) => e.id)).toEqual(['e3']);
  });

  it('sin busqueda salen todos', () => {
    expect(filtrarEjercicios(BIBLIOTECA, '   ')).toHaveLength(3);
  });

  it('no distingue mayusculas', () => {
    expect(filtrarEjercicios(BIBLIOTECA, 'PRESS')).toHaveLength(1);
  });

  it('un ejercicio sin material no rompe la busqueda', () => {
    expect(filtrarEjercicios(BIBLIOTECA, 'plancha')).toHaveLength(1);
  });

  it('el movil y el panel filtran exactamente igual', () => {
    for (const q of ['', 'remo', 'barra', 'CORE', 'pecho', 'no existe']) {
      expect(filtrarEjercicios(BIBLIOTECA, q), q).toEqual(filtrarWeb(BIBLIOTECA, q));
    }
  });

  it('y llaman igual a cada grupo muscular', () => {
    expect(NOMBRE_DEL_GRUPO).toEqual(GRUPOS_WEB);
  });
});

describe('como se lee un ejercicio', () => {
  it('dice que trabaja, y con que si lo hay', () => {
    expect(lineaDeEjercicio(ej({}))).toBe('Pecho · Barra');
    expect(lineaDeEjercicio(ej({ equipment: null }))).toBe('Pecho');
    expect(lineaDeEjercicio(ej({ equipment: '  ' }))).toBe('Pecho');
  });

  it('ningun grupo se queda sin nombre en castellano', () => {
    for (const grupo of GRUPOS) {
      expect(NOMBRE_DEL_GRUPO[grupo], grupo).toBeTruthy();
      expect(NOMBRE_DEL_GRUPO[grupo]).not.toContain('_');
    }
  });
});

describe('crear o editar un ejercicio', () => {
  it('recorta y manda lo minimo que acepta el contrato', () => {
    const envio = ejercicioAEnvio('  Zancadas  ', 'legs', '  Mancuernas ');
    expect(envio).toEqual({ name: 'Zancadas', muscleGroup: 'legs', equipment: 'Mancuernas' });
    expect(createExerciseSchema.safeParse(envio).success).toBe(true);
  });

  /*
   * Sin material es AUSENTE, no cadena vacia: el contrato lo declara opcional
   * y el servidor guarda `null`. Mandar '' lo dejaria como material vacio.
   */
  it('sin material, el campo no viaja', () => {
    const envio = ejercicioAEnvio('Plancha', 'core', '   ');
    expect(envio).not.toHaveProperty('equipment');
    expect(createExerciseSchema.safeParse(envio).success).toBe(true);
  });

  it('un nombre en blanco lo rechaza el contrato, no una regla nuestra', () => {
    expect(createExerciseSchema.safeParse(ejercicioAEnvio('   ', 'core', '')).success).toBe(false);
  });
});

const rut = (parcial: Partial<Routine>): Routine => ({
  id: 'r1',
  name: 'Fuerza',
  description: null,
  items: [{} as never, {} as never],
  activeAssignments: 0,
  status: 'active',
  ...parcial,
});

describe('la lista de rutinas', () => {
  /*
   * Las archivadas se quedan abajo, no se esconden: siguen teniendo socios que
   * las siguieron, y en V1 no se desarchivan. Verlas es la unica forma de
   * saber que existieron.
   */
  it('las activas van primero, las archivadas al final', () => {
    const lista = ordenarRutinas([
      rut({ id: 'a', name: 'Zeta', status: 'archived' }),
      rut({ id: 'b', name: 'Beta' }),
      rut({ id: 'c', name: 'Alfa' }),
    ]);
    expect(lista.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('dentro de cada grupo, por nombre y con las tildes en su sitio', () => {
    const lista = ordenarRutinas([rut({ id: 'a', name: 'Zancadas' }), rut({ id: 'b', name: 'Ábdomen' })]);
    expect(lista.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('la segunda linea cuenta ejercicios y socios', () => {
    expect(lineaDeRutina(rut({ activeAssignments: 3 }))).toBe('2 ejercicios · 3 socios');
    expect(lineaDeRutina(rut({ activeAssignments: 1 }))).toBe('2 ejercicios · 1 socio');
    expect(lineaDeRutina(rut({ activeAssignments: 0 }))).toBe('2 ejercicios · sin asignar');
    expect(lineaDeRutina(rut({ items: [{} as never] }))).toBe('1 ejercicio · sin asignar');
  });

  it('una archivada lo dice, en vez de contar socios', () => {
    expect(lineaDeRutina(rut({ status: 'archived', activeAssignments: 4 }))).toBe(
      '2 ejercicios · archivada',
    );
  });
});

describe('que rutinas se pueden asignar a un socio', () => {
  const TODAS = [
    rut({ id: 'r1', name: 'Fuerza' }),
    rut({ id: 'r2', name: 'Movilidad' }),
    rut({ id: 'r3', name: 'Vieja', status: 'archived' }),
  ];

  /*
   * Los dos motivos para dejar una fuera los impone el servidor: archivada
   * —«no admite asignaciones nuevas»— y ya asignada —«Ese socio ya sigue esa
   * rutina»—. Se filtran para no ofrecer lo que va a dar error.
   */
  it('ni las archivadas ni las que ya sigue', () => {
    expect(asignables(TODAS, [{ id: 'r1' }]).map((r) => r.id)).toEqual(['r2']);
  });

  it('sin ninguna asignada, salen todas las activas', () => {
    expect(asignables(TODAS, []).map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  /*
   * Asignar NO reemplaza: un socio puede seguir varias a la vez. Que quede una
   * asignada no debe vaciar la lista de las demas.
   */
  it('tener una asignada no impide ofrecer las otras', () => {
    expect(asignables(TODAS, [{ id: 'r2' }]).map((r) => r.id)).toEqual(['r1']);
  });
});

describe('quien puede hacer que', () => {
  const ROLES: Role[] = ['owner', 'trainer', 'receptionist', 'member'];

  /*
   * `@Roles('owner', 'trainer')` en las cuatro clases del controlador de
   * entrenamiento. Recepcion no entra: «quien decide como se entrena no es
   * quien atiende el mostrador».
   */
  it('entrenamiento es de dueño y entrenador, y de nadie mas', () => {
    expect(ROLES.filter(puedeEntrenar)).toEqual(['owner', 'trainer']);
    expect(ROLES.filter(puedeEditarEjercicios)).toEqual(['owner', 'trainer']);
    expect(ROLES.filter(puedeAsignarRutinas)).toEqual(['owner', 'trainer']);
  });

  it('recepcion no puede tocar entrenamiento', () => {
    expect(puedeEntrenar('receptionist')).toBe(false);
    expect(puedeEditarEjercicios('receptionist')).toBe(false);
    expect(puedeAsignarRutinas('receptionist')).toBe(false);
  });

  /*
   * Archivar NO se filtra por rol, y es deliberado: el servidor se lo permite
   * al entrenador que creo la rutina, y `routineSchema` no dice quien la creo.
   * Esconder el boton le quitaria al entrenador el archivado de SUS rutinas.
   */
  it('archivar solo mira el estado, no el rol', () => {
    expect(tieneSentidoArchivar('active')).toBe(true);
    expect(tieneSentidoArchivar('archived')).toBe(false);
  });
});
