import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import { RUTAS_INTERNAS } from '../navegacion/destinos';

/**
 * La paridad de PARITY-4 y el CIERRE de la paridad funcional entera.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE FICHERO TIENE DOS TRABAJOS.                                         │
 * │                                                                          │
 * │ El primero es el de siempre: las cinco capacidades de esta fase, con su  │
 * │ pantalla en las dos aplicaciones, su llamada real y su rol.              │
 * │                                                                          │
 * │ El segundo es nuevo y es el que de verdad cierra: recorre el panel web   │
 * │ ENTERO —los ONCE modulos de `@gymlab/api-client`, no solo los de una     │
 * │ fase— y exige que el movil cubra exactamente lo mismo. Ni menos, que     │
 * │ seria un hueco; ni mas, que seria romper la paridad al reves.            │
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
  movil: string[];
  metodo: string;
  endpoint: { controlador: string; busca: RegExp; desdeClase?: RegExp };
}

const CAPACIDADES: Capacidad[] = [
  {
    accion: 'Consultar los datos legales del responsable',
    roles: ['owner'],
    web: ['src/app/configuracion/page.tsx'],
    movil: ['app/(panel)/configuracion.tsx'],
    metodo: 'legal.get',
    endpoint: {
      controlador: 'legal/legal.controller.ts',
      busca: /@Get\(\)/,
      desdeClase: /@Controller\('gyms\/:gymId\/legal'\)/,
    },
  },
  {
    accion: 'Editar los datos legales del responsable',
    roles: ['owner'],
    web: ['src/app/configuracion/page.tsx'],
    movil: ['app/(panel)/configuracion.tsx'],
    metodo: 'legal.update',
    endpoint: {
      controlador: 'legal/legal.controller.ts',
      busca: /@Patch\(\)/,
      desdeClase: /@Controller\('gyms\/:gymId\/legal'\)/,
    },
  },
  {
    accion: 'Consultar el estado del documento de privacidad',
    roles: ['owner'],
    web: ['src/app/configuracion/page.tsx'],
    movil: ['app/(panel)/configuracion.tsx'],
    metodo: 'legal.documentStatus',
    endpoint: {
      controlador: 'progress/privacy-document.controller.ts',
      busca: /@Get\(\)/,
      desdeClase: /@Controller\('gyms\/:gymId\/privacy-document'\)/,
    },
  },
  {
    accion: 'Saber si un socio ha autorizado el tratamiento de sus datos de salud',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/socio/progreso.tsx'],
    movil: ['src/progreso/registro-de-medicion.tsx'],
    metodo: 'progreso.consentimientoDeSalud',
    endpoint: {
      controlador: 'progress/progress.controller.ts',
      busca: /@Get\(\)/,
      desdeClase: /@Controller\('gyms\/:gymId\/members\/:memberId\/health-consent'\)/,
    },
  },
  {
    accion: 'Registrar una medición de un socio',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/socio/progreso.tsx'],
    movil: ['src/progreso/registro-de-medicion.tsx'],
    metodo: 'progreso.registrar',
    endpoint: {
      controlador: 'progress/progress.controller.ts',
      busca: /@Post\(\)/,
      desdeClase: /@Controller\('gyms\/:gymId\/members\/:memberId\/progress'\)/,
    },
  },
];

/**
 * Los roles que mandan en UN endpoint, resolviendo herencia clase + metodo.
 *
 * Misma funcion que en `personal/paridad.test.ts`, y por el mismo motivo: si
 * el endpoint no tiene `@Roles` propio, manda el de su clase. Tomar «el mas
 * cercano por encima» esta MAL y ya invento un permiso una vez.
 */
function rolesDe(controlador: string, busca: RegExp, desdeClase?: RegExp): string {
  const completo = readFileSync(join(API, controlador), 'utf8');
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

describe('la matriz de capacidades de PARITY-4', () => {
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

  const REAL = [
    leer(MOVIL, 'src', 'legal', 'fuente-real.ts'),
    leer(MOVIL, 'src', 'entrenador', 'fuente-real.ts'),
  ].join('\n');

  it('cada acción llega hasta la API, no se queda en el botón', () => {
    for (const c of CAPACIDADES) {
      const [modulo, metodo] = c.metodo.split('.');
      expect(REAL, `${c.accion}: falta el envoltorio`).toMatch(
        new RegExp(`api\\.${modulo}\\.${metodo}\\(`),
      );
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

  it('lo legal es solo del dueño, y la pantalla lo comprueba por dentro', () => {
    const legales = CAPACIDADES.filter((c) => c.metodo.startsWith('legal.'));
    expect(legales).toHaveLength(3);
    for (const c of legales) expect(c.roles).toEqual(['owner']);

    // El grupo `(panel)` deja entrar tambien a recepcion: sin esto, la
    // pantalla se abriria y pediria datos que la API le negaria con un 403.
    const codigo = leer(APP, '(panel)', 'configuracion.tsx');
    expect(codigo).toMatch(/puedeConfigurarLoLegal\(/);
    // Y la fila del Panel tampoco se le pinta.
    expect(leer(APP, '(panel)', 'panel.tsx')).toMatch(/puedeConfigurarLoLegal\(/);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL ENDPOINT ADMITE AL DUEÑO. EL PRODUCTO NO SE LO OFRECE.            │
   * │                                                                      │
   * │ `MemberProgressController` es `@Roles('owner','trainer')`, pero en el │
   * │ panel web la unica pantalla que registra mediciones vive en el AREA   │
   * │ del entrenador (`/entrenador/socio`), y `AREA_DE_ROL.owner` es        │
   * │ `panel`: un dueño no llega ahi. Su ficha de socio —`/socios/ficha`—   │
   * │ no tiene progreso, ni siquiera de lectura.                            │
   * │                                                                      │
   * │ Asi que el movil hace lo mismo: el formulario vive en el area del     │
   * │ entrenador y NO en la ficha del Panel. Ponerlo alli le daria al dueño │
   * │ del movil algo que el dueño de la web no tiene — paridad rota al      │
   * │ reves, que es lo mismo que se rechazo para los ajustes del gimnasio.  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('el progreso se registra en el área del entrenador, en las dos', () => {
    expect(() => statSync(join(WEB, 'src', 'app', 'socios', 'ficha', 'progreso.tsx'))).toThrow();
    const fichaWeb = readdirSync(join(WEB, 'src', 'app', 'socios', 'ficha'));
    expect(fichaWeb.join(' ')).not.toMatch(/progreso/);

    const fichaDelPanel = leer(APP, '(panel)', 'socio', '[id]', 'index.tsx');
    expect(fichaDelPanel, 'la ficha del Panel no registra mediciones').not.toMatch(
      /RegistroDeMedicion|registrarMedicion/,
    );

    const delEntrenador = leer(APP, '(entrenador)', 'asignado', '[id].tsx');
    expect(delEntrenador).toMatch(/RegistroDeMedicion/);
  });

  /*
   * El consentimiento se CONSULTA desde el personal y se CONCEDE por el socio.
   * La API tiene `POST`/`DELETE` de health-consent para el personal y el panel
   * NO los usa: un consentimiento que otorga otro en tu nombre no es
   * consentimiento. El movil tampoco.
   */
  it('el personal lee el consentimiento; no lo concede ni lo retira', () => {
    const delMovil = [
      leer(MOVIL, 'src', 'entrenador', 'fuente-real.ts'),
      leer(MOVIL, 'src', 'progreso', 'registro-de-medicion.tsx'),
    ].join('\n');
    expect(delMovil).toMatch(/api\.progreso\.consentimientoDeSalud\(/);
    // `yo.*` es el socio en su propia pantalla: eso si existe y es otro sitio.
    expect(delMovil).not.toMatch(/progreso\.(aceptar|revocar|conceder)/);
  });
});

/**
 * ── EL CIERRE ──────────────────────────────────────────────────────────────
 *
 * Los once modulos de `@gymlab/api-client`, no los de una fase.
 */
describe('el panel y el móvil cubren exactamente las mismas capacidades', () => {
  const MODULOS = [
    'auth',
    'members',
    'billing',
    'accesos',
    'legal',
    'invitations',
    'staff',
    'entrenadores',
    'entrenamiento',
    'progreso',
    'yo',
  ];
  const PATRON = new RegExp(`api\\s*\\.\\s*(${MODULOS.join('|')})\\s*\\.\\s*([a-zA-Z]+)`, 'g');

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

  it('el extractor encuentra el panel entero (si no, esto no prueba nada)', () => {
    /*
     * Prettier parte las llamadas largas —`api.invitations\n  .create(...)`— y
     * un matcher ingenuo encontro 11 de 18 metodos la primera vez. Sesenta es
     * el suelo: por debajo, el extractor esta roto, no el producto.
     */
    expect(delPanel.size).toBeGreaterThanOrEqual(60);
  });

  it('todo lo que usa el panel lo usa también el móvil', () => {
    const faltan = [...delPanel].filter((m) => !delMovil.has(m)).sort();
    expect(faltan, 'capacidades del panel que el móvil no tiene').toEqual([]);
  });

  it('y el móvil no se inventa capacidades que el panel no tiene', () => {
    const demas = [...delMovil].filter((m) => !delPanel.has(m)).sort();
    expect(demas, 'capacidades que solo tiene el móvil').toEqual([]);
  });
});

/**
 * ── LO QUE ESTA FUERA, Y POR QUE ───────────────────────────────────────────
 *
 * `GymSettingsController` NO es un hueco de paridad: es una capacidad de la
 * API que el producto no expone en ningun sitio. Queda escrito aqui para que
 * nadie lo cuente como pendiente, y para que si algun dia alguien lo activa
 * solo en un lado, esto lo diga.
 */
describe('GymSettingsController es API-ONLY, no un hueco', () => {
  it('existe en la API, con sus roles', () => {
    const codigo = readFileSync(join(API, 'access', 'access.controller.ts'), 'utf8');
    expect(codigo).toMatch(/@Controller\('gyms\/:gymId\/settings'\)/);
    expect(codigo).toMatch(/@Controller\('gyms\/:gymId\/settings'\)\s*@Roles\('owner'\)/);
  });

  it('y NO existe en `@gymlab/api-client`: el producto no puede llamarlo', () => {
    const cliente = readFileSync(
      join(MOVIL, '..', '..', 'packages', 'api-client', 'src', 'index.ts'),
      'utf8',
    );
    expect(cliente).not.toMatch(/settings|ajustes/i);
  });

  it('ni el panel ni el móvil lo usan, y así se queda hasta que se decida', () => {
    const buscar = (raiz: string): string[] => {
      const encontrados: string[] = [];
      const recorrer = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) {
            if (!/node_modules|\.next|out|\.expo/.test(e.name)) recorrer(p);
          } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
            if (/api\s*\.\s*(settings|ajustes)/.test(readFileSync(p, 'utf8'))) encontrados.push(p);
          }
        }
      };
      recorrer(raiz);
      return encontrados;
    };
    expect(buscar(join(WEB, 'src'))).toEqual([]);
    expect(buscar(join(MOVIL, 'src'))).toEqual([]);
    expect(buscar(APP)).toEqual([]);
  });

  it('y la decisión está escrita donde se buscaría', () => {
    expect(leer(MOVIL, 'src', 'legal', 'permisos.ts')).toMatch(
      /AJUSTES_DEL_GIMNASIO_SON_SOLO_DE_API/,
    );
  });
});

describe('la ruta de configuración está donde tiene gate', () => {
  it('apunta a un fichero que existe DENTRO de `(panel)`', () => {
    expect(() => statSync(join(APP, '(panel)', 'configuracion.tsx'))).not.toThrow();
    expect(RUTAS_INTERNAS.configuracion).toBe('/configuracion');
  });

  it('no se gatea por su cuenta: el gate del grupo más el rol por dentro', () => {
    const codigo = leer(APP, '(panel)', 'configuracion.tsx');
    expect(codigo).not.toMatch(/puedeEntrarEnArea|<Redirect/);
  });
});
