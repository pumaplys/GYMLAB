import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Me, Role } from '@gymlab/contracts';
import { ROLES } from '@gymlab/contracts';
import type { Area, EstadoDeSesion } from '../auth/estado';
import { AREA_DE_ROL, resolverAcceso } from '../auth/estado';
import { INICIO_DE_AREA, destinoDe, puedeEntrarEnArea } from './destinos';

/**
 * El reparto por areas, y sobre todo: que nadie entre en la ajena.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESCONDER PESTAÑAS NO ES SEGURIDAD.                                      │
 * │                                                                          │
 * │ Un area no se protege por no pintar su boton: se protege en el layout    │
 * │ del grupo, que es por donde pasa TAMBIEN un enlace directo. La prueba    │
 * │ que de verdad importa es la matriz de abajo — cada rol contra cada area, │
 * │ incluidas las nueve combinaciones que NO deben entrar.                   │
 * │                                                                          │
 * │ Y esto no sustituye al servidor: la API rechaza por rol cada endpoint    │
 * │ igualmente. Lo que se comprueba aqui es que la app no pinte pantallas    │
 * │ que la API va a rechazar enteras.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const GIMNASIO = '11111111-1111-4111-8111-111111111111';
const AREAS = Object.keys(INICIO_DE_AREA) as Area[];

function sesionDe(rol: Role): EstadoDeSesion {
  const yo = {
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Quien Sea',
      email: 'quien@ejemplo.local',
      emailVerified: true,
      isPlatformAdmin: false,
    },
    activeGymId: GIMNASIO,
    memberships: [{ gymId: GIMNASIO, gymName: 'Gimnasio Vista', role: rol }],
  } as Me;
  return resolverAcceso(yo);
}

describe('cada rol tiene un area, y solo una', () => {
  it('el reparto es el mismo que el del panel web', () => {
    expect(AREA_DE_ROL).toEqual({
      member: 'socio',
      owner: 'panel',
      receptionist: 'panel',
      trainer: 'entrenador',
    });
  });

  it('hay tres areas y cada una tiene puerta de entrada', () => {
    expect(AREAS.sort()).toEqual(['entrenador', 'panel', 'socio']);
    for (const area of AREAS) expect(INICIO_DE_AREA[area]).toMatch(/^\//);
  });

  it('las tres puertas son distintas', () => {
    const puertas = AREAS.map((a) => INICIO_DE_AREA[a]);
    expect(new Set(puertas).size).toBe(puertas.length);
  });
});

describe('la matriz de acceso: cada rol contra cada area', () => {
  it('cada rol entra en la SUYA y en ninguna otra', () => {
    for (const rol of ROLES) {
      const sesion = sesionDe(rol);
      const suya = AREA_DE_ROL[rol];
      for (const area of AREAS) {
        expect(puedeEntrarEnArea(sesion, area), `${rol} en ${area}`).toBe(area === suya);
      }
    }
  });

  /*
   * Los casos que el producto nombro uno a uno. Se escriben aparte de la
   * matriz aunque esten cubiertos: si alguien afloja la matriz, estos siguen
   * diciendo exactamente que no puede pasar.
   */
  it('un socio no entra en el panel ni en entrenador', () => {
    const socio = sesionDe('member');
    expect(puedeEntrarEnArea(socio, 'panel')).toBe(false);
    expect(puedeEntrarEnArea(socio, 'entrenador')).toBe(false);
  });

  it('recepcion no entra en el area del socio', () => {
    expect(puedeEntrarEnArea(sesionDe('receptionist'), 'socio')).toBe(false);
  });

  it('un entrenador no entra en el panel', () => {
    expect(puedeEntrarEnArea(sesionDe('trainer'), 'panel')).toBe(false);
  });

  it('el dueño tampoco entra en el area del socio ni en la del entrenador', () => {
    const dueno = sesionDe('owner');
    expect(puedeEntrarEnArea(dueno, 'socio')).toBe(false);
    expect(puedeEntrarEnArea(dueno, 'entrenador')).toBe(false);
  });

  it('a cada rol se le manda a la puerta de su area', () => {
    for (const rol of ROLES) {
      expect(destinoDe(sesionDe(rol)), rol).toBe(INICIO_DE_AREA[AREA_DE_ROL[rol]]);
    }
  });
});

/**
 * El gate no es una comprobacion suelta: tiene que estar en el LAYOUT de cada
 * grupo, que es por donde pasa un enlace directo. Se lee el arbol de rutas.
 */
describe('las tres areas estan gateadas en su layout', () => {
  const APP = join(__dirname, '..', '..', 'app');
  const GRUPOS: Record<Area, string> = {
    socio: '(socio)',
    panel: '(panel)',
    entrenador: '(entrenador)',
  };

  const sinComentarios = (codigo: string) =>
    codigo
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

  it('cada grupo tiene su `_layout.tsx`', () => {
    for (const grupo of Object.values(GRUPOS)) {
      expect(readdirSync(join(APP, grupo)), grupo).toContain('_layout.tsx');
    }
  });

  it('cada layout comprueba SU area, no otra', () => {
    for (const [area, grupo] of Object.entries(GRUPOS) as [Area, string][]) {
      const codigo = sinComentarios(readFileSync(join(APP, grupo, '_layout.tsx'), 'utf8'));
      expect(codigo, grupo).toContain(`puedeEntrarEnArea(estado, '${area}')`);
      // Y si no puede, devuelve a la puerta para que decida ella.
      expect(codigo, grupo).toMatch(/Redirect href="\/"/);
    }
  });

  it('ningun layout deduce el area del rol por su cuenta', () => {
    // Deducirla dos veces son dos politicas, y dos politicas se separan.
    for (const grupo of Object.values(GRUPOS)) {
      const codigo = sinComentarios(readFileSync(join(APP, grupo, '_layout.tsx'), 'utf8'));
      expect(codigo, grupo).not.toMatch(/role ===|\.role\b|AREA_DE_ROL/);
    }
  });

  /*
   * Las subrutas de Perfil viven FUERA de `(socio)` —son una pila aparte— y
   * por eso necesitan su propio gate. Es el fallo que se encontro en M8B.
   */
  it('las subrutas de Perfil siguen gateadas, y como area de socio', () => {
    const codigo = sinComentarios(readFileSync(join(APP, 'perfil', '_layout.tsx'), 'utf8'));
    expect(codigo).toContain("puedeEntrarEnArea(estado, 'socio')");
  });
});
