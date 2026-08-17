/**
 * Guardarrail de fronteras entre modulos (ADR-0006).
 *
 * ADR-0006: «Un modulo nunca importa el repositorio de otro: pide a su servicio
 * de aplicacion.»
 *
 * Esa regla se incumplia en cuatro de siete modulos y **nadie se enteraba**: no
 * rompe nada, no da error y los tests seguian en verde. Lo detecto una auditoria
 * manual, que es exactamente lo que un guardarrail debe evitar que haga falta.
 *
 * Es hermano de los otros tres —RLS por tabla, `gym_id` en las claves ajenas y el
 * cableado de variables de entorno—: no comprueba una funcionalidad, comprueba
 * que nadie se salte un paso.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(process.cwd(), 'src');

/**
 * Que tablas puede tocar cada modulo.
 *
 * `auditLog` lo escriben todos a proposito: la auditoria es transversal y no
 * pertenece a ningun dominio.
 *
 * `users`, `memberships` y `sessions` son de `identity`, y las tocan `auth` e
 * `invitations`. Es la desviacion que queda viva y esta documentada: aceptarla
 * aqui es explicito, no un olvido. Ver el PR de estabilizacion.
 */
const PERMITIDAS: Record<string, string[]> = {
  members: ['members', 'memberNotes', 'memberCounters'],
  trainers: ['trainers', 'trainerAssignments', 'users'],
  billing: ['plans', 'memberSubscriptions', 'payments'],
  access: ['accessTokens', 'accessEvents'],
  training: ['exercises', 'exerciseTemplates', 'routines', 'routineItems', 'routineAssignments'],
  progress: ['bodyMetrics', 'consents'],
  invitations: ['invitations', 'users', 'memberships', 'sessions'],
  auth: ['users', 'memberships', 'sessions', 'authEvents', 'authThrottle', 'gyms', 'organizations'],
  dashboard: [],
  /**
   * `legal` comparte `organizations` con `auth`, y es deliberado.
   *
   * La tabla guarda dos cosas distintas: la cuenta que contrata GYMLAB —de la
   * que se ocupa `auth` al dar de alta un gimnasio— y la identidad juridica del
   * responsable del tratamiento, que es lo unico que toca este modulo.
   *
   * Separarlas en dos tablas seria mas puro y peor: una relacion 1:1 obligatoria
   * que nadie puede crear por su cuenta. Este modulo existe justamente para que
   * el de consentimientos no lea `organizations` directamente.
   */
  legal: ['organizations'],
};

/** Toda tabla del esquema, para saber cuando un identificador es una tabla. */
const TABLAS = [
  'members', 'memberNotes', 'memberCounters', 'trainers', 'trainerAssignments',
  'plans', 'memberSubscriptions', 'payments', 'accessTokens', 'accessEvents',
  'exercises', 'exerciseTemplates', 'routines', 'routineItems', 'routineAssignments',
  'bodyMetrics', 'consents', 'invitations', 'users', 'memberships', 'sessions',
  'gyms', 'organizations', 'authEvents', 'authThrottle', 'auditLog',
];

/** Las tablas que un modulo importa realmente de `@gymlab/db`. */
function tablasQueImporta(modulo: string): string[] {
  const dir = resolve(raiz, modulo);
  const encontradas = new Set<string>();

  for (const fichero of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const codigo = readFileSync(resolve(dir, fichero), 'utf8');
    // Solo el bloque de importacion del esquema: asi una mencion en un
    // comentario no cuenta como uso, que es lo que hacia inutil el grep suelto.
    for (const bloque of codigo.matchAll(/import \{([^}]*)\} from '@gymlab\/db';/g)) {
      for (const simbolo of bloque[1]!.split(',').map((s) => s.trim())) {
        if (TABLAS.includes(simbolo)) encontradas.add(simbolo);
      }
    }
  }
  return [...encontradas];
}

describe('ADR-0006: ningun modulo lee la tabla de otro', () => {
  for (const [modulo, permitidas] of Object.entries(PERMITIDAS)) {
    it(`${modulo} solo toca sus tablas`, () => {
      const usadas = tablasQueImporta(modulo);
      // `auditLog` y `gyms` son transversales: la auditoria la escribe todo el
      // mundo, y el gimnasio es el tenant, no el dominio de nadie.
      const ajenas = usadas.filter(
        (t) => !permitidas.includes(t) && t !== 'auditLog' && t !== 'gyms',
      );

      expect(
        ajenas,
        `${modulo} importa tablas de otro modulo: ${ajenas.join(', ')}. ` +
          'ADR-0006: pidelo a su servicio de aplicacion.',
      ).toEqual([]);
    });
  }
});

describe('el modulo de autenticacion no depende de ningun dominio', () => {
  it('AuthModule no importa modulos de dominio', () => {
    // `auth` es `@Global` y la base de todo. Cuando importaba `TrainingModule`
    // para sembrar la biblioteca, quedaba un ciclo latente
    // `auth -> training -> members -> invitations -> (token de auth)`: no estaba
    // cerrado porque nadie inyecta `AuthService`, y el dia que alguien lo
    // hiciera, Nest se colgaria en el arranque SIN ningun error.
    const codigo = readFileSync(resolve(raiz, 'auth/auth.module.ts'), 'utf8');
    const imports = /imports:\s*\[([^\]]*)\]/.exec(codigo)?.[1] ?? '';

    for (const dominio of ['Members', 'Trainers', 'Billing', 'Training', 'Progress', 'Access']) {
      expect(imports, `AuthModule importa ${dominio}Module`).not.toContain(dominio);
    }
  });

  it('nadie inyecta AuthService', () => {
    // Es la otra mitad de la garantia: mientras nadie lo inyecte, el ciclo no se
    // puede cerrar por el otro extremo.
    const sospechosos: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = resolve(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(ruta);
        else if (entrada.name.endsWith('.ts') && !ruta.includes('auth') && !ruta.includes('__tests__')) {
          // Se busca la INYECCION —`: AuthService` en un constructor, o
          // `Inject(AuthService)`—, no la palabra. Mencionarlo en un comentario
          // para explicar por que no se usa no puede poner el test en rojo.
          const codigo = readFileSync(ruta, 'utf8');
          if (/:\s*AuthService\b|Inject\(\s*AuthService\s*\)/.test(codigo)) {
            sospechosos.push(entrada.name);
          }
        }
      }
    };
    recorrer(raiz);

    expect(sospechosos, `inyectan AuthService: ${sospechosos.join(', ')}`).toEqual([]);
  });
});
