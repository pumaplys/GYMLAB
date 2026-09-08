import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import { RUTAS_INTERNAS } from '../navegacion/destinos';

/**
 * La paridad de ACCESOS, PERSONAL, ENTRENADORES e INVITACIONES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINCO COSAS TIENEN QUE HACER FALLAR ESTE FICHERO.                        │
 * │                                                                          │
 * │   1. que el panel gane una accion de esta fase y el movil no;            │
 * │   2. que el movil exponga una que el panel no tiene;                     │
 * │   3. que el movil la exponga a un rol distinto del que autoriza la API;  │
 * │   4. que una ruta nueva quede fuera de gate;                             │
 * │   5. que una capacidad exista solo VISUALMENTE y no llegue a la API.     │
 * │                                                                          │
 * │ Las cinco estan abajo, en ese orden.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const MOVIL = join(__dirname, '..', '..');
const WEB = join(MOVIL, '..', 'web');
const API = join(MOVIL, '..', 'api', 'src');
const APP = join(MOVIL, 'app');

const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const leer = (base: string, ...partes: string[]) =>
  sinComentarios(readFileSync(join(base, ...partes), 'utf8'));

interface Capacidad {
  accion: string;
  /** Quien puede, segun la API. */
  roles: Role[];
  web: string[];
  /** La pantalla o el componente del movil que la ofrece. */
  movil: string[];
  /** Control tecnico: `modulo.metodo` de `@gymlab/api-client`. */
  metodo: string;
  /**
   * Donde declara la API sus roles: fichero y regex del endpoint.
   *
   * `desdeClase` acota la busqueda cuando hay endpoints con el mismo nombre en
   * dos controladores del mismo fichero — `@Get('events')` esta en el del
   * socio y en el del gimnasio.
   */
  endpoint: { controlador: string; busca: RegExp; desdeClase?: RegExp };
}

const CAPACIDADES: Capacidad[] = [
  /*
   * El escaner NO es nuevo —se valido en iPhone en STAFF-2— pero es una accion
   * funcional del area de accesos, y la matriz tiene que enumerarla: si algun
   * dia desapareciera del movil, esto lo diria.
   */
  {
    accion: 'Escanear el carné de un socio en la puerta',
    roles: ['owner', 'receptionist'],
    web: ['src/app/accesos/escaner.tsx'],
    movil: ['app/(panel)/escaner.tsx'],
    metodo: 'accesos.verify',
    endpoint: {
      controlador: 'access/access.controller.ts',
      busca: /@Post\('verify'\)/,
      desdeClase: /@Controller\('gyms\/:gymId\/access'\)/,
    },
  },
  {
    accion: 'Ver el historial de accesos del gimnasio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/accesos/historial.tsx'],
    movil: ['app/(panel)/accesos.tsx'],
    metodo: 'accesos.events',
    endpoint: {
      controlador: 'access/access.controller.ts',
      busca: /@Get\('events'\)/,
      desdeClase: /@Controller\('gyms\/:gymId\/access'\)/,
    },
  },
  {
    accion: 'Ver quién trabaja en el gimnasio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/personal/page.tsx'],
    movil: ['app/(panel)/personal.tsx'],
    metodo: 'staff.list',
    endpoint: { controlador: 'auth/staff.controller.ts', busca: /@Get\(\)/ },
  },
  {
    accion: 'Retirar el acceso a alguien del personal',
    roles: ['owner'],
    web: ['src/app/personal/page.tsx'],
    movil: ['app/(panel)/personal.tsx'],
    metodo: 'staff.revoke',
    endpoint: { controlador: 'auth/staff.controller.ts', busca: /@Delete\('.userId'\)/ },
  },
  {
    accion: 'Ver las invitaciones de personal',
    roles: ['owner', 'receptionist'],
    web: ['src/app/personal/page.tsx'],
    movil: ['app/(panel)/personal.tsx'],
    metodo: 'invitations.list',
    endpoint: {
      controlador: 'invitations/invitations.controller.ts',
      busca: /@Get\('gyms\/:gymId\/invitations'\)/,
    },
  },
  {
    accion: 'Invitar a alguien como personal, con el rol que permita CAN_INVITE',
    roles: ['owner', 'receptionist'],
    web: ['src/app/personal/page.tsx'],
    movil: ['app/(panel)/personal.tsx'],
    metodo: 'invitations.create',
    endpoint: {
      controlador: 'invitations/invitations.controller.ts',
      busca: /@Post\('gyms\/:gymId\/invitations'\)/,
    },
  },
  {
    accion: 'Revocar una invitación pendiente',
    roles: ['owner', 'receptionist'],
    web: ['src/app/personal/page.tsx'],
    movil: ['app/(panel)/personal.tsx'],
    metodo: 'invitations.revoke',
    endpoint: {
      controlador: 'invitations/invitations.controller.ts',
      busca: /@Delete\('gyms\/:gymId\/invitations\/:id'\)/,
    },
  },
  {
    accion: 'Ver qué entrenadores lleva un socio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/entrenadores.tsx'],
    movil: ['src/personal/entrenadores-del-socio.tsx'],
    metodo: 'entrenadores.deSocio',
    endpoint: { controlador: 'trainers/trainers.controller.ts', busca: /class MemberTrainers/ },
  },
  {
    accion: 'Ver los entrenadores del gimnasio para elegir uno',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/entrenadores.tsx'],
    movil: ['app/(panel)/socio/[id]/entrenadores.tsx'],
    metodo: 'entrenadores.lista',
    endpoint: { controlador: 'trainers/trainers.controller.ts', busca: /@Get\(\)/ },
  },
  {
    accion: 'Asignar un entrenador a un socio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/entrenadores.tsx'],
    movil: ['app/(panel)/socio/[id]/entrenadores.tsx'],
    metodo: 'entrenadores.asignar',
    endpoint: { controlador: 'trainers/trainers.controller.ts', busca: /@Post\('.id\/members'\)/ },
  },
  {
    accion: 'Retirar la asignación de un entrenador',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/entrenadores.tsx'],
    movil: ['src/personal/entrenadores-del-socio.tsx'],
    metodo: 'entrenadores.retirar',
    endpoint: {
      controlador: 'trainers/trainers.controller.ts',
      busca: /@Delete\('.id\/members\/:memberId'\)/,
    },
  },
];

/**
 * Los roles que mandan en UN endpoint, resolviendo herencia clase + metodo.
 *
 * Si el endpoint no tiene `@Roles` propio, manda el de su clase. Tomar «el mas
 * cercano por encima» esta MAL y ya invento un permiso una vez: en
 * `PlansController`, `@Patch(':id')` heredaba `owner` y el `@Get()` de encima
 * tenia `receptionist`.
 */
function rolesDe(controlador: string, busca: RegExp, desdeClase?: RegExp): string {
  const completo = readFileSync(join(API, controlador), 'utf8');
  /*
   * Sin anclar, `@Get('events')` casaba con el de `me/access` —el del socio,
   * que no lleva `@Roles`— en vez de con el del gimnasio. El resultado era una
   * cadena vacia, y el test decia que el endpoint no admitia a nadie.
   */
  const desplazamiento = desdeClase ? completo.search(desdeClase) : 0;
  expect(desplazamiento, `no se encontro la clase en ${controlador}`).toBeGreaterThanOrEqual(0);
  const codigo = completo.slice(desplazamiento);
  const indice = codigo.search(busca);
  expect(indice, `no se encontro ${busca} en ${controlador}`).toBeGreaterThan(0);
  const antes = codigo.slice(0, indice);

  const decoradores = [...antes.matchAll(/@(Get|Post|Patch|Put|Delete)\(/g)];
  const desde = decoradores.length > 0 ? decoradores[decoradores.length - 1]!.index : 0;
  const propio = antes.slice(desde).match(/@Roles\([^)]*\)/);
  if (propio) return propio[0];

  const clases = [...antes.matchAll(/@Controller\([^)]*\)\s*(@Roles\([^)]*\))?/g)];
  return clases[clases.length - 1]?.[1] ?? '';
}

describe('la matriz de capacidades de accesos, personal y entrenadores', () => {
  it('cada acción existe DE VERDAD en las dos, no solo en la tabla', () => {
    for (const c of CAPACIDADES) {
      for (const f of c.web) {
        expect(() => statSync(join(WEB, f)), `${c.accion} (web)`).not.toThrow();
      }
      for (const f of c.movil) {
        expect(() => statSync(join(MOVIL, f)), `${c.accion} (movil)`).not.toThrow();
      }
    }
  });

  /*
   * ── GATE 5 ────────────────────────────────────────────────────────────
   * Que la capacidad no exista SOLO VISUALMENTE. Se comprueba la cadena
   * entera: pantalla -> envoltorio de `fuente` -> `api.<modulo>.<metodo>`.
   * Una pantalla con su boton y sin llamada pasaria cualquier otra prueba.
   */
  /*
   * Dos ficheros: el escaner llego en STAFF-2 y vive en `escaner/fuente-real`;
   * lo demas, en `personal/fuente-real`. Se miran los dos porque lo que importa
   * es que la cadena LLEGUE, no en que modulo se escribio.
   */
  const REAL = [
    leer(MOVIL, 'src', 'personal', 'fuente-real.ts'),
    leer(MOVIL, 'src', 'escaner', 'fuente-real.ts'),
  ].join('\n');

  it('cada acción llega hasta la API, no se queda en el botón', () => {
    for (const c of CAPACIDADES) {
      const [modulo, metodo] = c.metodo.split('.');
      expect(REAL, `${c.accion}: falta el envoltorio`).toMatch(
        new RegExp(`api\\.${modulo}\\.${metodo}\\(`),
      );
      /*
       * Y la pantalla tiene que importar de ALGUNA `fuente`, no pintar y ya.
       * Se acepta cualquier ruta que termine en `fuente` —relativa desde
       * `src/personal`, o `src/escaner/fuente` desde `app/`— porque lo que se
       * vigila es que pase por el envoltorio, no en que carpeta esta.
       */
      const codigo = c.movil.map((f) => leer(MOVIL, f)).join('\n');
      expect(codigo, `${c.accion}: la pantalla no usa ninguna fuente`).toMatch(
        /from '[^']*\/fuente'/,
      );
    }
  });

  it('y el panel usa ese mismo método para la misma acción', () => {
    for (const c of CAPACIDADES) {
      const codigo = c.web.map((f) => leer(WEB, f)).join('\n');
      const [modulo, metodo] = c.metodo.split('.');
      expect(codigo, `${c.accion} -> ${c.metodo}`).toMatch(
        new RegExp(`api\\s*\\.\\s*${modulo}\\s*\\.\\s*${metodo}\\b`),
      );
    }
  });

  /*
   * ── GATE 3 ────────────────────────────────────────────────────────────
   * Que el rol de la tabla sea el que autoriza la API, resolviendo herencia.
   */
  it('los roles de la tabla son los que autoriza la API', () => {
    for (const c of CAPACIDADES) {
      const roles = rolesDe(c.endpoint.controlador, c.endpoint.busca, c.endpoint.desdeClase);
      for (const rol of c.roles) {
        expect(roles, `${c.accion} deberia admitir ${rol}`).toContain(`'${rol}'`);
      }
      for (const fuera of (['owner', 'receptionist', 'trainer'] as Role[]).filter(
        (r) => !c.roles.includes(r),
      )) {
        expect(roles, `${c.accion} NO deberia admitir ${fuera}`).not.toContain(`'${fuera}'`);
      }
    }
  });

  /*
   * «Ver la lista no da poder sobre ella»: es la unica de esta fase que se
   * separa, y se nombra aparte para que quede escrito cual es.
   */
  it('retirar el acceso es la única de la fase que es solo del dueño', () => {
    const soloDueno = CAPACIDADES.filter((c) => c.roles.length === 1);
    expect(soloDueno.map((c) => c.metodo)).toEqual(['staff.revoke']);
    expect(soloDueno[0]?.roles).toEqual(['owner']);
  });
});

/**
 * ── GATES 1 y 2 ────────────────────────────────────────────────────────────
 *
 * La tabla la escribe una persona y una persona olvida filas. Esto recorre el
 * panel web ENTERO y exige que cada metodo de esta fase que use el panel este
 * tambien en el movil — y que el movil no se invente ninguno.
 */
describe('nada de lo que hace el panel se queda fuera, ni al revés', () => {
  const PATRON = /api\s*\.\s*(accesos|staff|entrenadores|invitations)\s*\.\s*([a-zA-Z]+)/g;

  function metodosEn(raiz: string): Set<string> {
    const encontrados = new Set<string>();
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (!/node_modules|\.next|out|\.expo/.test(e.name)) recorrer(p);
        } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
          for (const m of sinComentarios(readFileSync(p, 'utf8')).matchAll(PATRON)) {
            encontrados.add(`${m[1]}.${m[2]}`);
          }
        }
      }
    };
    recorrer(raiz);
    return encontrados;
  }

  const delPanel = metodosEn(join(WEB, 'src'));
  const delMovil = new Set([...metodosEn(join(MOVIL, 'src')), ...metodosEn(APP)]);

  it('el extractor encuentra algo (si no, esto no prueba nada)', () => {
    expect(delPanel.size).toBeGreaterThanOrEqual(10);
  });

  it('todo lo que usa el panel lo usa también el móvil', () => {
    const faltan = [...delPanel].filter((m) => !delMovil.has(m)).sort();
    expect(faltan, 'métodos del panel que el móvil no usa').toEqual([]);
  });

  it('y el móvil no se inventa capacidades que el panel no tiene', () => {
    const demas = [...delMovil].filter((m) => !delPanel.has(m)).sort();
    expect(demas, 'métodos que solo usa el móvil').toEqual([]);
  });

  it('cada uno está en la tabla, con su acción funcional', () => {
    const enLaTabla = new Set(CAPACIDADES.map((c) => c.metodo));
    const sinAccion = [...delPanel].filter((m) => !enLaTabla.has(m)).sort();
    expect(sinAccion, 'métodos sin acción funcional descrita').toEqual([]);
  });
});

/**
 * ── GATE 4 ─────────────────────────────────────────────────────────────────
 *
 * Que ninguna ruta nueva de la fase quede fuera de gate. `pantallas.test.ts`
 * ya vigila el arbol entero; aqui se nombran las de esta fase una a una, para
 * que si alguien mueve una el fallo diga CUAL.
 */
describe('las rutas de la fase están donde tienen gate', () => {
  const ESPERADAS: Record<string, string> = {
    accesos: '(panel)/accesos.tsx',
    personal: '(panel)/personal.tsx',
    entrenadoresDe: '(panel)/socio/[id]/entrenadores.tsx',
  };

  it('cada ruta apunta a un fichero que existe DENTRO de `(panel)`', () => {
    for (const [nombre, fichero] of Object.entries(ESPERADAS)) {
      expect(() => statSync(join(APP, fichero)), `${nombre} -> ${fichero}`).not.toThrow();
    }
  });

  it('y las constantes de navegación apuntan ahí', () => {
    expect(RUTAS_INTERNAS.accesos).toBe('/accesos');
    expect(RUTAS_INTERNAS.personal).toBe('/personal');
    expect(RUTAS_INTERNAS.entrenadoresDe('x')).toBe('/socio/x/entrenadores');
  });

  /*
   * `(panel)` gatea por AREA, y ahi entran dueño y recepcion. Las pantallas de
   * esta fase son de los dos, asi que el gate del grupo basta — salvo retirar
   * el acceso, que ademas comprueba el rol dentro.
   */
  it('ninguna se gatea por su cuenta: el gate es el del grupo', () => {
    for (const fichero of Object.values(ESPERADAS)) {
      const codigo = leer(APP, fichero);
      expect(codigo, fichero).not.toMatch(/puedeEntrarEnArea|<Redirect/);
    }
  });

  it('y retirar el acceso sí comprueba el rol dentro', () => {
    const codigo = leer(APP, '(panel)', 'personal.tsx');
    expect(codigo).toMatch(/puedeRetirarAcceso\(/);
  });
});
