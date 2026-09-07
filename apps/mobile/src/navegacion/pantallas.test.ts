import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Me, Role } from '@gymlab/contracts';
import { ROLES } from '@gymlab/contracts';
import type { Area } from '../auth/estado';
import { AREA_DE_ROL, resolverAcceso } from '../auth/estado';
import { puedeEntrarEnArea } from './destinos';

/**
 * Quien llega a CADA pantalla de la app, incluidas las de STAFF-FINAL.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL GATE SIGUE SIENDO EL DEL GRUPO. AQUI SE COMPRUEBA QUE NADIE SE SALE. │
 * │                                                                          │
 * │ Buscar un socio, su ficha, mis socios y la ficha del asignado son cuatro │
 * │ pantallas nuevas, y ninguna lleva un gate propio: viven DENTRO de        │
 * │ `(panel)` y `(entrenador)`. Lo que hay que impedir es que alguien cree   │
 * │ la quinta fuera, y eso se comprueba recorriendo el arbol, no con una     │
 * │ lista escrita a mano que se queda vieja el primer dia.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const APP = join(__dirname, '..', '..', 'app');
const GRUPOS: Record<Area, string> = {
  socio: '(socio)',
  panel: '(panel)',
  entrenador: '(entrenador)',
};

const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** Todas las pantallas, con su ruta relativa a `app/`. */
function pantallas(dir: string, prefijo = ''): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completa = join(dir, entrada);
    const relativa = prefijo ? `${prefijo}/${entrada}` : entrada;
    if (statSync(completa).isDirectory()) salida.push(...pantallas(completa, relativa));
    else if (entrada.endsWith('.tsx')) salida.push(relativa);
  }
  return salida;
}

const TODAS = pantallas(APP);

/** Las que NO necesitan sesion: la puerta y lo que se enseña justo antes. */
const PUBLICAS = [
  'index.tsx',
  '_layout.tsx',
  'entrar.tsx',
  'elegir-gimnasio.tsx',
  'no-admitido.tsx',
  'problema.tsx',
  '+not-found.tsx',
  /*
   * PARITY-0. Volver a entrar y aceptar una invitacion ocurren ANTES de tener
   * sesion, asi que no pueden vivir dentro de un area: pedirles rol seria
   * pedirselo a quien todavia no lo tiene. `invitacion.tsx` SI mira si hay
   * sesion, pero para elegir camino —crear, entrar o vincular—, no para
   * decidir quien pasa.
   */
  'recuperar.tsx',
  'restablecer.tsx',
  'invitacion.tsx',
];

function sesionDe(rol: Role) {
  return resolverAcceso({
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Quien Sea',
      email: 'quien@ejemplo.local',
      emailVerified: true,
      isPlatformAdmin: false,
    },
    activeGymId: '11111111-1111-4111-8111-111111111111',
    memberships: [
      { gymId: '11111111-1111-4111-8111-111111111111', gymName: 'Gimnasio Vista', role: rol },
    ],
  } as Me);
}

describe('el arbol de pantallas', () => {
  it('hay pantallas que mirar', () => {
    expect(TODAS.length).toBeGreaterThanOrEqual(15);
  });

  it('toda pantalla es publica a proposito o vive bajo una carpeta con gate', () => {
    const gateadas = [...Object.values(GRUPOS), 'perfil'];
    const huerfanas = TODAS.filter((ruta) => {
      if (!ruta.includes('/')) return !PUBLICAS.includes(ruta);
      return !gateadas.some((carpeta) => ruta.startsWith(`${carpeta}/`));
    });
    expect(huerfanas, 'pantallas sin gate').toEqual([]);
  });

  /*
   * Las cuatro de STAFF-FINAL, nombradas una a una. Si alguien las mueve, este
   * test lo dice ademas del de arriba — y dice cual.
   */
  it('las pantallas nuevas estan donde deben', () => {
    expect(TODAS).toContain('(panel)/buscar.tsx');
    expect(TODAS).toContain('(panel)/socio/[id].tsx');
    expect(TODAS).toContain('(entrenador)/entrenador.tsx');
    expect(TODAS).toContain('(entrenador)/asignado/[id].tsx');
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ NINGUNA PANTALLA SE GATEA A SI MISMA.                                │
   * │                                                                      │
   * │ Un segundo control dentro de la pantalla no suma seguridad: suma una  │
   * │ segunda politica, y dos politicas acaban separandose. La que manda es │
   * │ el layout del grupo, que es por donde pasa TAMBIEN un enlace directo. │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('solo los `_layout.tsx` deciden quien entra', () => {
    for (const ruta of TODAS) {
      if (ruta.endsWith('_layout.tsx')) continue;
      const codigo = sinComentarios(readFileSync(join(APP, ruta), 'utf8'));
      expect(codigo, ruta).not.toMatch(/puedeEntrarEnArea|AREA_DE_ROL/);
    }
  });
});

describe('quien entra en cada area, rol por rol', () => {
  it('el Panel —escanear, buscar y la ficha— es de la dueña y de recepcion', () => {
    const conAcceso = ROLES.filter((rol) => puedeEntrarEnArea(sesionDe(rol), 'panel'));
    expect([...conAcceso].sort()).toEqual(['owner', 'receptionist']);
  });

  it('«Mis socios» y la ficha del asignado son SOLO del entrenador', () => {
    const conAcceso = ROLES.filter((rol) => puedeEntrarEnArea(sesionDe(rol), 'entrenador'));
    expect([...conAcceso]).toEqual(['trainer']);
  });

  it('la experiencia del socio sigue siendo solo suya', () => {
    const conAcceso = ROLES.filter((rol) => puedeEntrarEnArea(sesionDe(rol), 'socio'));
    expect([...conAcceso]).toEqual(['member']);
  });

  /*
   * Los cruces que el producto nombro. Estan cubiertos por la matriz, y aun
   * asi se escriben: si alguien afloja la matriz, estos siguen diciendo
   * exactamente que no puede pasar.
   */
  it('un entrenador NO llega a buscar socios del gimnasio', () => {
    expect(puedeEntrarEnArea(sesionDe('trainer'), 'panel')).toBe(false);
  });

  it('un socio NO llega ni al Panel ni a la lista del entrenador', () => {
    expect(puedeEntrarEnArea(sesionDe('member'), 'panel')).toBe(false);
    expect(puedeEntrarEnArea(sesionDe('member'), 'entrenador')).toBe(false);
  });

  it('recepcion NO llega a los socios de un entrenador', () => {
    expect(puedeEntrarEnArea(sesionDe('receptionist'), 'entrenador')).toBe(false);
  });

  it('cada rol entra en la suya y en ninguna otra', () => {
    for (const rol of ROLES) {
      for (const area of Object.keys(GRUPOS) as Area[]) {
        expect(puedeEntrarEnArea(sesionDe(rol), area), `${rol} en ${area}`).toBe(
          AREA_DE_ROL[rol] === area,
        );
      }
    }
  });

  it('sin sesion no se entra en ninguna, ni con un enlace directo', () => {
    const fuera = [
      { tipo: 'cargando' },
      { tipo: 'sinSesion' },
      { tipo: 'errorAlComprobar', motivo: 'red' },
      { tipo: 'rolNoAdmitido', yo: {} as Me },
      { tipo: 'requiereSeleccionGimnasio', yo: {} as Me, opciones: [] },
    ] as const;
    for (const estado of fuera) {
      for (const area of Object.keys(GRUPOS) as Area[]) {
        expect(puedeEntrarEnArea(estado, area), `${estado.tipo} en ${area}`).toBe(false);
      }
    }
  });
});

/**
 * El Panel movil es de CONSULTA. Ninguna de sus pantallas escribe.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES UNA PREFERENCIA DE ESTILO: ES EL ALCANCE DE V1.                   │
 * │                                                                          │
 * │ Dar de alta, cobrar, editar o asignar son decisiones que se toman        │
 * │ sentado. Si alguien añade un boton que llame a un `crear`, `actualizar`, │
 * │ `eliminar` o `registrar` en estas pantallas, esto lo dice.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('las pantallas del personal no escriben nada', () => {
  const DEL_PERSONAL = TODAS.filter(
    (r) => r.startsWith('(panel)/') || r.startsWith('(entrenador)/'),
  );

  it('hay pantallas del personal que mirar', () => {
    expect(DEL_PERSONAL.length).toBeGreaterThanOrEqual(6);
  });

  it('ninguna llama a un metodo de escritura del cliente', () => {
    for (const ruta of DEL_PERSONAL) {
      const codigo = sinComentarios(readFileSync(join(APP, ruta), 'utf8'));
      expect(codigo, ruta).not.toMatch(
        /\b(crear|actualizar|eliminar|registrar|asignar|retirar|dardeBaja|invitar)[A-Z]?\w*\s*\(/,
      );
      // Ni por la puerta de atras: nada de POST/PATCH/DELETE a mano.
      expect(codigo, ruta).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
    }
  });
});
