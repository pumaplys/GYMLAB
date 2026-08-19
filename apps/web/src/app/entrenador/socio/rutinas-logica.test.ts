import type { AssignedRoutine, Routine } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  DESDE_CUANTAS_SE_BUSCA,
  cuantosEjercicios,
  elegibles,
  filtrarRutinas,
} from './rutinas-logica';

/**
 * LO QUE LA PANTALLA PUEDE OFRECER, Y LO QUE NO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NINGUNA REGLA DE AQUI ES DE LA PANTALLA.                                 │
 * │                                                                          │
 * │ El backend permite VARIAS rutinas vigentes a la vez y rechaza solo la    │
 * │ misma dos veces. Estas pruebas fijan que la interfaz representa eso y no │
 * │ una version inventada — ni mas permisiva ni mas estricta.                │
 * │                                                                          │
 * │ Y marcar "Ya la sigue" NO es la barrera: si el estado local se queda     │
 * │ viejo, quien corta es el 400 del servidor.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const rutina = (id: string, name: string, items = 1): Routine => ({
  id,
  name,
  description: null,
  activeAssignments: 0,
  status: 'active' as const,
  items: Array.from({ length: items }, (_, i) => ({
    id: `item-${id}-${i}`,
    exerciseId: '00000000-0000-4000-8000-000000000001',
    exerciseName: 'Press de banca',
    position: i + 1,
    sets: 3,
    reps: '10',
    restSeconds: null,
    notes: null,
  })),
});

const asignada = (r: Routine): AssignedRoutine => ({
  ...r,
  assignmentId: `asig-${r.id}`,
  assignedAt: '2026-08-01T10:00:00.000Z',
});

describe('que rutinas se pueden asignar', () => {
  it('las del gimnasio salen todas, siga o no alguna', () => {
    const a = rutina('r1', 'Fuerza');
    const b = rutina('r2', 'Movilidad');
    const lista = elegibles([a, b], [asignada(a)]);

    // Las que ya sigue NO se esconden: quien busca "Fuerza" y no la encuentra
    // no deduce que ya la tiene, deduce que la pantalla esta rota.
    expect(lista).toHaveLength(2);
    expect(lista.map((c) => c.rutina.name)).toEqual(['Fuerza', 'Movilidad']);
  });

  it('marca la que ya sigue, que es la unica que el servidor rechazaria', () => {
    const a = rutina('r1', 'Fuerza');
    const b = rutina('r2', 'Movilidad');
    const lista = elegibles([a, b], [asignada(a)]);

    expect(lista.find((c) => c.rutina.id === 'r1')!.yaLaSigue).toBe(true);
    expect(lista.find((c) => c.rutina.id === 'r2')!.yaLaSigue).toBe(false);
  });

  it('seguir VARIAS a la vez es normal: ninguna bloquea a las demas', () => {
    // El modelo lo permite a proposito —fuerza y movilidad— asi que una segunda
    // asignacion no puede aparecer como imposible.
    const a = rutina('r1', 'Fuerza');
    const b = rutina('r2', 'Movilidad');
    const c = rutina('r3', 'Core');
    const lista = elegibles([a, b, c], [asignada(a), asignada(b)]);

    expect(lista.filter((x) => !x.yaLaSigue).map((x) => x.rutina.name)).toEqual(['Core']);
  });

  it('sin rutinas asignadas, todas son elegibles', () => {
    const lista = elegibles([rutina('r1', 'Fuerza'), rutina('r2', 'Movilidad')], []);
    expect(lista.every((c) => !c.yaLaSigue)).toBe(true);
  });

  it('una rutina asignada que ya no esta en el listado del gimnasio no inventa una opcion', () => {
    // Puede pasar si otro entrenador la borra entre las dos peticiones. La
    // seccion la sigue mostrando como asignada; el selector no la ofrece.
    const viva = rutina('r1', 'Fuerza');
    const borrada = rutina('r9', 'Ya no existe');
    const lista = elegibles([viva], [asignada(borrada)]);

    expect(lista).toHaveLength(1);
    expect(lista[0]!.rutina.id).toBe('r1');
    expect(lista[0]!.yaLaSigue).toBe(false);
  });

  it('una rutina archivada no se ofrece: el servidor la rechazaria siempre', () => {
    // Y aqui SI se esconde, al reves que "ya la sigue". Esa se desbloquea
    // terminando la asignacion; esta no se desbloquea nunca —en V1 no se
    // desarchiva— asi que ofrecerla es prometer algo que no va a pasar.
    const viva = rutina('r1', 'Fuerza');
    const archivada = { ...rutina('r2', 'Movilidad'), status: 'archived' as const };
    const lista = elegibles([viva, archivada], []);

    expect(lista.map((c) => c.rutina.id)).toEqual(['r1']);
  });

  it('archivar no borra el pasado: la que el socio ya sigue se sigue viendo', () => {
    // La lista de asignadas viene de otra peticion y no pasa por aqui. Esta
    // prueba fija que el filtro no arrastra con el lo que el socio ya tiene:
    // el selector se queda vacio, pero `asignadas` no es cosa de `elegibles`.
    const archivada = { ...rutina('r1', 'Fuerza'), status: 'archived' as const };
    const lista = elegibles([archivada], [asignada(archivada)]);

    expect(lista).toEqual([]);
  });
});

describe('buscar entre las rutinas', () => {
  const candidatas = elegibles(
    [
      { ...rutina('r1', 'Fuerza tren superior'), description: 'Para empezar' },
      { ...rutina('r2', 'Movilidad'), description: 'Rehabilitacion de hombro' },
    ],
    [],
  );

  it('busca por nombre', () => {
    expect(filtrarRutinas(candidatas, 'fuerza').map((c) => c.rutina.id)).toEqual(['r1']);
  });

  it('busca tambien por descripcion', () => {
    expect(filtrarRutinas(candidatas, 'hombro').map((c) => c.rutina.id)).toEqual(['r2']);
  });

  it('sin texto devuelve todas', () => {
    expect(filtrarRutinas(candidatas, '   ')).toHaveLength(2);
  });

  it('el buscador solo aparece cuando hay bastantes', () => {
    // Con tres rutinas un campo de busqueda es ruido; con treinta es necesario.
    expect(DESDE_CUANTAS_SE_BUSCA).toBeGreaterThan(1);
    expect(3 >= DESDE_CUANTAS_SE_BUSCA).toBe(false);
    expect(30 >= DESDE_CUANTAS_SE_BUSCA).toBe(true);
  });
});

describe('como se cuenta lo que tiene una rutina', () => {
  it('singular y plural', () => {
    expect(cuantosEjercicios(rutina('r1', 'A', 1))).toBe('1 ejercicio');
    expect(cuantosEjercicios(rutina('r2', 'B', 4))).toBe('4 ejercicios');
  });
});
