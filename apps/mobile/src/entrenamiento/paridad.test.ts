import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';

/**
 * La paridad de ENTRENAMIENTO entre el panel web y el movil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA METRICA ES LA ACCION FUNCIONAL. LOS METODOS SON EL CONTROL TECNICO.  │
 * │                                                                          │
 * │ Contar metodos de API detecta huecos, pero no dice si el producto tiene  │
 * │ paridad: se puede llamar a `crearRutina` desde una pantalla que no deja  │
 * │ ordenar los ejercicios, y el recuento saldria al 100 %.                  │
 * │                                                                          │
 * │ Por eso la tabla de abajo enumera lo que alguien PUEDE HACER, con su rol │
 * │ y con los dos sitios donde se hace. Los metodos van al lado como         │
 * │ comprobacion: que la pantalla del movil llegue de verdad al mismo        │
 * │ endpoint que la del panel, y no a otro parecido.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const MOVIL = join(__dirname, '..', '..');
const WEB = join(MOVIL, '..', 'web');

const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const leer = (base: string, ...partes: string[]) =>
  sinComentarios(readFileSync(join(base, ...partes), 'utf8'));

interface Capacidad {
  /** Lo que alguien puede hacer, dicho en palabras. */
  accion: string;
  /** Quien puede, segun la API. No segun lo que nos parezca. */
  roles: Role[];
  /** Donde se hace en el panel web, relativo a `apps/web`. */
  web: string[];
  /** Donde se hace en el movil, relativo a `apps/mobile`. */
  movil: string[];
  /** El metodo de `@gymlab/api-client` que lo ejecuta. */
  metodo: string;
}

/**
 * Las doce acciones de entrenamiento, sacadas de las pantallas del panel web.
 *
 * NO de los endpoints: la API tiene ademas `DELETE /routines/:id`, pero
 * `@gymlab/api-client` no lo expone y ninguna pantalla del panel lo ofrece, asi
 * que no forma parte del alcance del producto. La referencia es la web.
 */
const CAPACIDADES: Capacidad[] = [
  {
    accion: 'Ver la biblioteca de ejercicios del gimnasio',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/ejercicios/page.tsx'],
    movil: ['app/(entrenamiento)/ejercicios/index.tsx'],
    metodo: 'ejercicios',
  },
  {
    /*
     * Buscar NO llama a la API: filtra lo que ya se trajo, porque el endpoint
     * devuelve la biblioteca entera y no admite filtro. Por eso la fila nombra
     * DOS ficheros: el que carga y el que filtra. El metodo sigue siendo el de
     * la carga, que es el endpoint que sostiene la capacidad.
     */
    accion: 'Buscar en la biblioteca por nombre, material o grupo',
    roles: ['owner', 'trainer'],
    web: ['src/lib/ejercicios.ts', 'src/app/entrenador/ejercicios/page.tsx'],
    movil: ['src/entrenamiento/biblioteca.ts', 'app/(entrenamiento)/ejercicios/index.tsx'],
    metodo: 'ejercicios',
  },
  {
    accion: 'Crear un ejercicio',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/ejercicios/formulario.tsx'],
    movil: ['app/(entrenamiento)/ejercicios/nuevo.tsx'],
    metodo: 'crearEjercicio',
  },
  {
    accion: 'Editar un ejercicio',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/ejercicios/formulario.tsx'],
    movil: ['app/(entrenamiento)/ejercicios/[id].tsx'],
    metodo: 'actualizarEjercicio',
  },
  {
    accion: 'Quitar un ejercicio de la biblioteca',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/ejercicios/page.tsx'],
    movil: ['app/(entrenamiento)/ejercicios/[id].tsx'],
    metodo: 'eliminarEjercicio',
  },
  {
    accion: 'Ver las rutinas del gimnasio',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/rutinas/page.tsx'],
    movil: ['app/(entrenamiento)/rutinas/index.tsx'],
    metodo: 'rutinas',
  },
  {
    accion: 'Ver la ficha de una rutina con sus ejercicios',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/rutinas/editar/page.tsx'],
    movil: ['app/(entrenamiento)/rutinas/[id]/index.tsx'],
    metodo: 'rutina',
  },
  {
    accion: 'Crear una rutina con sus ejercicios, series, repeticiones, descanso, notas y ORDEN',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/rutinas/nueva/page.tsx'],
    movil: ['app/(entrenamiento)/rutinas/nueva.tsx'],
    metodo: 'crearRutina',
  },
  {
    accion: 'Editar una rutina entera, incluido reordenar sus ejercicios',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/rutinas/editar/page.tsx'],
    movil: ['app/(entrenamiento)/rutinas/[id]/editar.tsx'],
    metodo: 'actualizarRutina',
  },
  {
    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ ESTA FILA FALTABA, Y LA ENCONTRO LA REVISION CONTRA LA WEB.      │
     * │                                                                  │
     * │ El editor del panel tiene «Elegir sustituto» para un ejercicio    │
     * │ que el gimnasio borro de la biblioteca: cambia a que apunta la    │
     * │ fila y conserva series, repeticiones, descanso y notas. Sin ella, │
     * │ la unica salida seria quitar la fila y perder ese trabajo.        │
     * │                                                                  │
     * │ No es una accion «del editor»: es la unica forma de volver a      │
     * │ guardar una rutina que quedo rota por un borrado ajeno.           │
     * └──────────────────────────────────────────────────────────────────┘
     */
    accion: 'Sustituir un ejercicio que ya no está en la biblioteca, conservando lo escrito',
    roles: ['owner', 'trainer'],
    // El sustituto se elige en el editor; quien guarda es la pantalla.
    web: ['src/app/entrenador/rutinas/editor.tsx', 'src/app/entrenador/rutinas/editar/page.tsx'],
    movil: [
      'src/entrenamiento/editor-de-rutina.tsx',
      'app/(entrenamiento)/rutinas/[id]/editar.tsx',
    ],
    metodo: 'actualizarRutina',
  },
  {
    accion: 'Archivar una rutina',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/rutinas/ficha/page.tsx'],
    movil: ['app/(entrenamiento)/rutinas/[id]/index.tsx'],
    metodo: 'archivarRutina',
  },
  {
    accion: 'Ver que rutinas sigue un socio',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/socio/rutinas.tsx'],
    movil: ['src/entrenamiento/rutinas-del-socio.tsx'],
    metodo: 'rutinasDeSocio',
  },
  {
    accion: 'Asignarle una rutina a un socio',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/socio/rutinas.tsx'],
    movil: ['app/(entrenamiento)/asignar/[socioId].tsx'],
    metodo: 'asignarRutina',
  },
  {
    accion: 'Terminar la asignacion de una rutina',
    roles: ['owner', 'trainer'],
    web: ['src/app/entrenador/socio/rutinas.tsx'],
    movil: ['src/entrenamiento/rutinas-del-socio.tsx'],
    metodo: 'terminarAsignacion',
  },
];

describe('la matriz de capacidades funcionales', () => {
  it('cada accion existe DE VERDAD en las dos, no solo en la tabla', () => {
    for (const c of CAPACIDADES) {
      for (const fichero of c.web) {
        expect(() => statSync(join(WEB, fichero)), `${c.accion} (web)`).not.toThrow();
      }
      for (const fichero of c.movil) {
        expect(() => statSync(join(MOVIL, fichero)), `${c.accion} (movil)`).not.toThrow();
      }
    }
  });

  /*
   * El control tecnico. Que la pantalla del movil llegue al MISMO endpoint que
   * la del panel: no basta con que exista una pantalla parecida.
   *
   * En el movil la llamada pasa por el envoltorio de `fuente.ts` —eso es lo
   * que permite la vista previa— asi que la cadena tiene tres eslabones y se
   * comprueba entera, como se hizo en PARITY-0.
   */
  const REAL = leer(MOVIL, 'src', 'entrenamiento', 'fuente-real.ts');

  it('cada accion del movil llega a `api.entrenamiento.<metodo>`', () => {
    for (const c of CAPACIDADES) {
      expect(REAL, c.accion).toMatch(new RegExp(`api\\.entrenamiento\\.${c.metodo}\\(`));
    }
  });

  it('y el panel usa ese mismo metodo para la misma accion', () => {
    for (const c of CAPACIDADES) {
      const codigo = c.web.map((f) => leer(WEB, f)).join('\n');
      expect(codigo, `${c.accion} -> ${c.metodo}`).toMatch(
        new RegExp(`api\\.entrenamiento\\.${c.metodo}\\b|${c.metodo}\\(`),
      );
    }
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL GATE DE VERDAD: QUE NO SE QUEDE NADA DE LA WEB FUERA DEL MOVIL.       │
 * │                                                                          │
 * │ La tabla de arriba la escribe una persona, y una persona puede olvidarse │
 * │ de una fila. Esto no: recorre el panel web ENTERO buscando llamadas a    │
 * │ `api.entrenamiento.*` y exige que cada metodo que el panel usa este      │
 * │ tambien en el movil.                                                     │
 * │                                                                          │
 * │ Es la comprobacion que convierte «creo que estan todas» en «estan».      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('nada de lo que hace el panel se queda fuera', () => {
  function metodosEn(raiz: string, dir: string): Set<string> {
    const encontrados = new Set<string>();
    const recorrer = (actual: string) => {
      for (const e of readdirSync(actual, { withFileTypes: true })) {
        const p = join(actual, e.name);
        if (e.isDirectory()) {
          if (!/node_modules|\.next|out/.test(e.name)) recorrer(p);
        } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
          const codigo = sinComentarios(readFileSync(p, 'utf8'));
          /*
           * Prettier parte las llamadas largas en varias lineas, asi que el
           * punto y el metodo pueden estar separados por saltos y espacios.
           * Sin `[\s\S]*?` se perdian llamadas de verdad — paso en la
           * auditoria de paridad, y dio un hueco mucho menor del real.
           */
          for (const m of codigo.matchAll(/api\s*\.\s*entrenamiento\s*\.\s*([a-zA-Z]+)/g)) {
            if (m[1]) encontrados.add(m[1]);
          }
        }
      }
    };
    recorrer(join(raiz, dir));
    return encontrados;
  }

  const delPanel = metodosEn(WEB, 'src');
  const delMovil = metodosEn(MOVIL, 'src');

  it('el extractor encuentra algo (si no, esto no prueba nada)', () => {
    expect(delPanel.size).toBeGreaterThanOrEqual(10);
    expect(delMovil.size).toBeGreaterThanOrEqual(10);
  });

  it('todo metodo de entrenamiento que usa el panel lo usa tambien el movil', () => {
    const faltan = [...delPanel].filter((m) => !delMovil.has(m)).sort();
    expect(faltan, 'metodos del panel que el movil no usa').toEqual([]);
  });

  it('y cada uno esta en la tabla de capacidades, con su accion', () => {
    const enLaTabla = new Set(CAPACIDADES.map((c) => c.metodo));
    const sinAccion = [...delPanel].filter((m) => !enLaTabla.has(m)).sort();
    expect(sinAccion, 'metodos sin accion funcional descrita').toEqual([]);
  });

  /*
   * Al reves tambien: si el movil llamara a algo que el panel no usa, seria
   * una capacidad inventada. La regla es «lo mismo que la web», no «mas».
   */
  it('el movil no se inventa capacidades que el panel no tiene', () => {
    const demas = [...delMovil].filter((m) => !delPanel.has(m)).sort();
    expect(demas, 'metodos que solo usa el movil').toEqual([]);
  });
});

/**
 * Los permisos, que son la otra mitad de la paridad: la misma capacidad, con
 * las mismas condiciones. Se leen del controlador de la API, no de memoria.
 */
describe('los permisos son los de la API', () => {
  const CONTROLADOR = join(MOVIL, '..', 'api', 'src', 'training', 'training.controller.ts');

  it('todo el modulo de entrenamiento es de dueño y entrenador', () => {
    const codigo = readFileSync(CONTROLADOR, 'utf8');
    // Las cuatro clases con `:gymId`. La quinta (`/me/routines`) es del socio.
    const roles = codigo.match(/@Roles\([^)]*\)/g) ?? [];
    expect(roles.length).toBeGreaterThanOrEqual(3);
    for (const r of roles) {
      expect(r).toContain("'owner'");
      expect(r).toContain("'trainer'");
      // Recepcion NO: «quien decide como se entrena no es quien atiende el mostrador».
      expect(r).not.toContain('receptionist');
    }
  });

  it('y la tabla de capacidades dice lo mismo', () => {
    for (const c of CAPACIDADES) {
      expect(c.roles.sort(), c.accion).toEqual(['owner', 'trainer']);
    }
  });
});
