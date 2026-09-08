import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';

/**
 * La paridad de SOCIOS, CUOTAS, COBROS y PLANES entre el panel web y el movil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA METRICA ES LA ACCION FUNCIONAL. LOS METODOS SON EL CONTROL TECNICO.  │
 * │                                                                          │
 * │ La tabla dice lo que alguien PUEDE HACER, con que rol y en que dos       │
 * │ sitios se hace. Los metodos van al lado para comprobar que la pantalla   │
 * │ del movil llega al mismo endpoint que la del panel, y no a otro parecido.│
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const MOVIL = join(__dirname, '..', '..');
const WEB = join(MOVIL, '..', 'web');

const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const leer = (base: string, ...partes: string[]) =>
  sinComentarios(readFileSync(join(base, ...partes), 'utf8'));

interface Capacidad {
  accion: string;
  /** Quien puede, segun la API. No segun lo que nos parezca. */
  roles: Role[];
  web: string[];
  movil: string[];
  metodo: string;
}

/**
 * Las acciones del mostrador, sacadas de las pantallas del panel web.
 *
 * NO de los endpoints: la API tiene ademas `POST/GET /members/:id/notes`, y
 * ninguna pantalla del panel las usa. La referencia de alcance es la web.
 */
const CAPACIDADES: Capacidad[] = [
  {
    accion: 'Ver la lista de socios y buscar en ella',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/page.tsx'],
    movil: ['app/(panel)/buscar.tsx'],
    metodo: 'members.list',
  },
  {
    accion: 'Ver la ficha de un socio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/page.tsx'],
    movil: ['app/(panel)/socio/[id]/index.tsx'],
    metodo: 'members.getById',
  },
  {
    accion: 'Dar de alta a un socio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/nuevo/page.tsx'],
    movil: ['app/(panel)/alta.tsx'],
    metodo: 'members.create',
  },
  {
    accion: 'Editar los datos de un socio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/page.tsx'],
    movil: ['app/(panel)/socio/[id]/editar.tsx'],
    metodo: 'members.update',
  },
  {
    accion: 'Dar de baja a un socio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/page.tsx'],
    movil: ['src/socios/acciones-de-ficha.tsx'],
    metodo: 'members.deactivate',
  },
  {
    accion: 'Volver a dar de alta a un socio de baja',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/page.tsx'],
    movil: ['src/socios/acciones-de-ficha.tsx'],
    metodo: 'members.reactivate',
  },
  {
    accion: 'Invitar a un socio a la app',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/page.tsx'],
    movil: ['src/socios/acciones-de-ficha.tsx'],
    metodo: 'members.invite',
  },
  {
    accion: 'Exportar los datos de un socio',
    roles: ['owner'],
    web: ['src/app/socios/ficha/page.tsx'],
    movil: ['src/socios/acciones-de-ficha.tsx'],
    metodo: 'members.exportData',
  },
  {
    accion: 'Eliminar a un socio para siempre',
    roles: ['owner'],
    web: ['src/app/socios/ficha/page.tsx'],
    movil: ['src/socios/acciones-de-ficha.tsx'],
    metodo: 'members.erase',
  },
  {
    accion: 'Ver el estado de la cuota de un socio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/cuota.tsx'],
    movil: ['app/(panel)/socio/[id]/cuota.tsx'],
    metodo: 'billing.dues',
  },
  {
    accion: 'Dar de alta una cuota eligiendo plan',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/cuota.tsx'],
    movil: ['app/(panel)/socio/[id]/cuota.tsx'],
    metodo: 'billing.subscribe',
  },
  {
    accion: 'Congelar la cuota',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/cuota.tsx'],
    movil: ['app/(panel)/socio/[id]/cuota.tsx'],
    metodo: 'billing.pause',
  },
  {
    accion: 'Reanudar la cuota',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/cuota.tsx'],
    movil: ['app/(panel)/socio/[id]/cuota.tsx'],
    metodo: 'billing.resume',
  },
  {
    accion: 'Dar de baja la cuota',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/cuota.tsx'],
    movil: ['app/(panel)/socio/[id]/cuota.tsx'],
    metodo: 'billing.cancel',
  },
  {
    accion: 'Ver el historial de pagos de un socio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/cuota.tsx'],
    movil: ['app/(panel)/socio/[id]/pagos.tsx'],
    metodo: 'billing.listPayments',
  },
  {
    accion: 'Registrar un pago',
    roles: ['owner', 'receptionist'],
    web: ['src/app/socios/ficha/cuota.tsx'],
    movil: ['app/(panel)/socio/[id]/pagos.tsx'],
    metodo: 'billing.registerPayment',
  },
  {
    accion: 'Anular un pago, con motivo',
    roles: ['owner'],
    web: ['src/app/socios/ficha/cuota.tsx'],
    movil: ['app/(panel)/socio/[id]/pagos.tsx'],
    metodo: 'billing.voidPayment',
  },
  {
    accion: 'Ver los planes del gimnasio',
    roles: ['owner', 'receptionist'],
    web: ['src/app/planes/page.tsx'],
    movil: ['app/(panel)/planes/index.tsx'],
    metodo: 'billing.listPlans',
  },
  {
    accion: 'Crear un plan',
    roles: ['owner'],
    web: ['src/app/planes/page.tsx'],
    movil: ['app/(panel)/planes/nuevo.tsx'],
    metodo: 'billing.createPlan',
  },
  {
    accion: 'Editar un plan (nombre, descripción y precio; la periodicidad no)',
    roles: ['owner'],
    web: ['src/app/planes/page.tsx'],
    movil: ['app/(panel)/planes/[id].tsx'],
    metodo: 'billing.updatePlan',
  },
  {
    accion: 'Archivar un plan',
    roles: ['owner'],
    web: ['src/app/planes/page.tsx'],
    movil: ['app/(panel)/planes/[id].tsx'],
    metodo: 'billing.archivePlan',
  },
];

describe('la matriz de capacidades del mostrador', () => {
  it('cada accion existe DE VERDAD en las dos, no solo en la tabla', () => {
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
   * El control tecnico: que el movil llegue al MISMO endpoint. En el movil la
   * llamada pasa por el envoltorio de `fuente`, asi que la cadena tiene tres
   * eslabones y se comprueba entera.
   */
  /*
   * Dos ficheros: buscar y la ficha llegaron en STAFF-FINAL y viven en
   * `panel/fuente-real.ts`; lo que escribe, en `socios/fuente-real.ts`. Se
   * miran los dos porque lo que importa es que la cadena llegue, no en que
   * modulo se escribio.
   */
  const REAL = [
    leer(MOVIL, 'src', 'socios', 'fuente-real.ts'),
    leer(MOVIL, 'src', 'panel', 'fuente-real.ts'),
  ].join('\n');

  it('cada accion del movil llega a su metodo del cliente', () => {
    for (const c of CAPACIDADES) {
      const [modulo, metodo] = c.metodo.split('.');
      expect(REAL, c.accion).toMatch(new RegExp(`api\\.${modulo}\\.${metodo}\\(`));
    }
  });

  it('y el panel usa ese mismo metodo para la misma accion', () => {
    for (const c of CAPACIDADES) {
      const codigo = c.web.map((f) => leer(WEB, f)).join('\n');
      const [modulo, metodo] = c.metodo.split('.');
      expect(codigo, `${c.accion} -> ${c.metodo}`).toMatch(
        new RegExp(`api\\s*\\.\\s*${modulo}\\s*\\.\\s*${metodo}\\b`),
      );
    }
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL GATE DE VERDAD: QUE NO SE QUEDE NADA DE LA WEB FUERA DEL MOVIL.       │
 * │                                                                          │
 * │ La tabla la escribe una persona y una persona olvida filas. Esto recorre │
 * │ el panel web ENTERO buscando `api.members.*` y `api.billing.*`, y exige  │
 * │ que cada metodo que el panel usa este tambien en el movil.               │
 * │                                                                          │
 * │ El patron tolera saltos de linea a proposito: Prettier parte las         │
 * │ llamadas largas, y con un patron ingenuo la auditoria de este mismo      │
 * │ bloque conto 11 metodos donde habia 18.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('nada de lo que hace el panel se queda fuera', () => {
  const PATRON = /api\s*\.\s*(members|billing)\s*\.\s*([a-zA-Z]+)/g;

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
  const delMovil = new Set([
    ...metodosEn(join(MOVIL, 'src')),
    ...metodosEn(join(MOVIL, 'app')),
  ]);

  it('el extractor encuentra algo (si no, esto no prueba nada)', () => {
    expect(delPanel.size).toBeGreaterThanOrEqual(20);
  });

  it('todo metodo de socios o cobros que usa el panel lo usa tambien el movil', () => {
    const faltan = [...delPanel].filter((m) => !delMovil.has(m)).sort();
    expect(faltan, 'metodos del panel que el movil no usa').toEqual([]);
  });

  it('y cada uno esta en la tabla, con su accion funcional', () => {
    const enLaTabla = new Set(CAPACIDADES.map((c) => c.metodo));
    const sinAccion = [...delPanel].filter((m) => !enLaTabla.has(m)).sort();
    expect(sinAccion, 'metodos sin accion funcional descrita').toEqual([]);
  });

  it('el movil no se inventa capacidades que el panel no tiene', () => {
    const demas = [...delMovil].filter((m) => !delPanel.has(m)).sort();
    expect(demas, 'metodos que solo usa el movil').toEqual([]);
  });
});

/** Los permisos, leidos de los controladores de la API. No de memoria. */
describe('los permisos son los de la API', () => {
  const API = join(MOVIL, '..', 'api', 'src');

  /**
   * Los roles que mandan en UN endpoint concreto.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ «EL @Roles MAS CERCANO POR ENCIMA» ESTA MAL, Y ESTE TEST LO DEMOSTRO.│
   * │                                                                      │
   * │ En `PlansController`, `@Patch(':id')` NO tiene `@Roles` propio: hereda │
   * │ el de la CLASE, que es `@Roles('owner')`. Pero justo encima esta el    │
   * │ `@Get()` con `@Roles('owner', 'receptionist')`, asi que la heuristica  │
   * │ ingenua decia que editar un plan lo podia hacer recepcion.             │
   * │                                                                      │
   * │ Habria sido un permiso INVENTADO en la tabla de paridad. Se mira si    │
   * │ hay un `@Roles` entre el endpoint anterior y este; si no lo hay, manda │
   * │ el de la clase.                                                       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const rolesDe = (fichero: string, endpoint: RegExp): string => {
    const codigo = readFileSync(fichero, 'utf8');
    const indice = codigo.search(endpoint);
    expect(indice, `no se encontro ${endpoint}`).toBeGreaterThan(0);
    const antes = codigo.slice(0, indice);

    // Donde empieza el metodo anterior: ahi acaba lo que puede ser «suyo».
    const decoradores = [...antes.matchAll(/@(Get|Post|Patch|Put|Delete)\(/g)];
    const desde = decoradores.length > 0 ? decoradores[decoradores.length - 1]!.index : 0;
    const propio = antes.slice(desde).match(/@Roles\([^)]*\)/);
    if (propio) return propio[0];

    // Sin `@Roles` propio: manda el de la clase que contiene este endpoint.
    const clases = [...antes.matchAll(/@Controller\([^)]*\)\s*(@Roles\([^)]*\))?/g)];
    return clases[clases.length - 1]?.[1] ?? '';
  };

  it('exportar y eliminar un socio son del dueño', () => {
    const fichero = join(API, 'members', 'members.controller.ts');
    for (const endpoint of [/@Get\('.id\/export'\)/, /@Delete\('.id'\)/]) {
      const roles = rolesDe(fichero, endpoint);
      expect(roles, String(endpoint)).toContain("'owner'");
      expect(roles, String(endpoint)).not.toContain('receptionist');
    }
  });

  it('y el resto del modulo de socios, de dueño y recepcion', () => {
    const fichero = join(API, 'members', 'members.controller.ts');
    for (const endpoint of [/@Post\(\)/, /@Patch\('.id'\)/, /@Post\('.id\/deactivate'\)/]) {
      const roles = rolesDe(fichero, endpoint);
      expect(roles, String(endpoint)).toContain("'owner'");
      expect(roles, String(endpoint)).toContain("'receptionist'");
    }
  });

  it('anular un pago es del dueño', () => {
    const roles = rolesDe(join(API, 'billing', 'billing.controller.ts'), /@Post\('.id\/void'\)/);
    expect(roles).toContain("'owner'");
    expect(roles).not.toContain('receptionist');
  });

  /*
   * Los planes son el caso mas fino: la clase entera es del dueño y SOLO el
   * `GET` baja a recepcion. Recepcion necesita la lista para dar de alta una
   * cuota, no para cambiar los precios.
   */
  it('ver planes es de los dos; crear, editar y archivar, del dueño', () => {
    const fichero = join(API, 'billing', 'billing.controller.ts');
    expect(rolesDe(fichero, /@Get\(\)\n\s+list/)).toContain("'receptionist'");
    for (const endpoint of [/@Post\(\)\n\s+create/, /@Patch\('.id'\)/, /@Post\('.id\/archive'\)/]) {
      expect(rolesDe(fichero, endpoint), String(endpoint)).not.toContain('receptionist');
    }
  });

  it('y la tabla de capacidades dice exactamente eso', () => {
    const soloDueno = CAPACIDADES.filter((c) => c.roles.length === 1);
    expect(soloDueno.map((c) => c.metodo).sort()).toEqual([
      'billing.archivePlan',
      'billing.createPlan',
      'billing.updatePlan',
      'billing.voidPayment',
      'members.erase',
      'members.exportData',
    ]);
    for (const c of soloDueno) expect(c.roles, c.accion).toEqual(['owner']);
    for (const c of CAPACIDADES.filter((x) => x.roles.length > 1)) {
      expect(c.roles.sort(), c.accion).toEqual(['owner', 'receptionist']);
    }
  });
});
