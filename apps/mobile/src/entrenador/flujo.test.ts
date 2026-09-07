import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssignedMember, AssignedRoutine, BodyMetric } from '@gymlab/contracts';
import { RUTAS_INTERNAS } from '../navegacion/destinos';
import { lineaDeAsignado, ordenados, ultimaMedicion, valoresDeMedicion } from './logica';

/**
 * El recorrido completo: Mis socios -> tocar un socio -> su detalle.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE FICHERO NACE DE UN FALLO OBSERVADO EN EL IPHONE.                    │
 * │                                                                          │
 * │ Al tocar a Lucía desde «Mis socios» aparecio la ficha del PANEL —con su  │
 * │ cabecera «Buscar», su Cuota y su Ficha— en lugar del detalle del         │
 * │ entrenador con sus rutinas.                                              │
 * │                                                                          │
 * │ Lo que se comprueba aqui es la CADENA COMPLETA que puede romperse sin    │
 * │ que nadie se entere: que la lista use la ruta del entrenador, que esa    │
 * │ ruta corresponda a un fichero que existe DENTRO de `(entrenador)`, y que │
 * │ la pantalla de destino cargue rutinas y progreso — y no la cuota, que    │
 * │ es informacion de mostrador y no del entrenador.                        │
 * │                                                                          │
 * │ Antes solo se comprobaba cada pieza por separado. Las piezas estaban     │
 * │ bien; lo que no se comprobaba era que estuvieran ATADAS.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RAIZ = join(__dirname, '..', '..');
const APP = join(RAIZ, 'app');

const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const leer = (...partes: string[]) => sinComentarios(readFileSync(join(APP, ...partes), 'utf8'));

/**
 * De una ruta a el fichero que la sirve.
 *
 * Se DERIVA de la ruta, no se escribe: si alguien cambia
 * `socioDelEntrenador` para que apunte a otro sitio, aqui se busca el fichero
 * de ese otro sitio y el test dice que no existe —o que esta en el grupo
 * equivocado— en vez de seguir en verde.
 */
function ficheroDeRuta(ruta: string, grupo: string): string {
  // `/asignado/<id>` -> `asignado/[id].tsx`
  const partes = ruta.replace(/^\//, '').split('/');
  const ultima = partes.pop()!;
  return join(grupo, ...partes, `[${ultima.startsWith('[') ? ultima.slice(1, -1) : 'id'}].tsx`);
}

describe('tocar un socio en «Mis socios» lleva al detalle del ENTRENADOR', () => {
  const ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  it('la ruta del entrenador y la del panel son distintas', () => {
    // Si algun dia coincidieran, un area entraria en la pantalla de la otra.
    expect(RUTAS_INTERNAS.socioDelEntrenador(ID)).not.toBe(RUTAS_INTERNAS.socioDelPanel(ID));
  });

  it('la ruta del entrenador es `/asignado/<id>`', () => {
    expect(RUTAS_INTERNAS.socioDelEntrenador(ID)).toBe(`/asignado/${ID}`);
  });

  it('esa ruta la sirve un fichero que existe DENTRO de `(entrenador)`', () => {
    const relativo = ficheroDeRuta(RUTAS_INTERNAS.socioDelEntrenador('X'), '(entrenador)');
    expect(existsSync(join(APP, relativo)), `no existe app/${relativo}`).toBe(true);
  });

  it('y la del panel, un fichero dentro de `(panel)`', () => {
    const relativo = ficheroDeRuta(RUTAS_INTERNAS.socioDelPanel('X'), '(panel)');
    expect(existsSync(join(APP, relativo)), `no existe app/${relativo}`).toBe(true);
  });

  /*
   * El fallo observado en el iPhone es exactamente este: la lista del
   * entrenador llevando a la ficha del Panel.
   */
  it('la lista del entrenador NO navega a la ficha del Panel', () => {
    const codigo = leer('(entrenador)', 'entrenador.tsx');
    expect(codigo).toMatch(/RUTAS_INTERNAS\.socioDelEntrenador\(/);
    expect(codigo).not.toMatch(/socioDelPanel|['"`]\/socio\//);
  });

  it('y la busqueda del Panel NO navega al detalle del entrenador', () => {
    const codigo = leer('(panel)', 'buscar.tsx');
    expect(codigo).toMatch(/RUTAS_INTERNAS\.socioDelPanel\(/);
    expect(codigo).not.toMatch(/socioDelEntrenador|['"`]\/asignado\//);
  });

  it('cada pantalla vuelve a SU sitio', () => {
    // La cabecera «Buscar» sobre un socio del entrenador fue la primera señal
    // de que se estaba pintando la pantalla equivocada.
    const delEntrenador = leer('(entrenador)', 'asignado', '[id].tsx');
    expect(delEntrenador).toMatch(/volverA="\/entrenador"/);
    expect(delEntrenador).toMatch(/etiquetaDeVuelta="Mis socios"/);

    const delPanel = leer('(panel)', 'socio', '[id].tsx');
    expect(delPanel).toMatch(/volverA="\/buscar"/);
    expect(delPanel).toMatch(/etiquetaDeVuelta="Buscar"/);
  });
});

describe('cada detalle pide lo suyo, y solo lo suyo', () => {
  it('el del entrenador carga rutinas y progreso', () => {
    const codigo = leer('(entrenador)', 'asignado', '[id].tsx');
    expect(codigo).toMatch(/cargarMiSocio\(/);
    expect(codigo).toMatch(/cargarRutinas\(/);
    expect(codigo).toMatch(/cargarProgreso\(/);
  });

  /*
   * La cuota es informacion de MOSTRADOR: cuanto debe y hasta cuando. El
   * entrenador no cobra, y enseñarsela seria darle un dato economico de sus
   * socios que su trabajo no necesita.
   */
  it('el del entrenador NO carga la cuota', () => {
    const codigo = leer('(entrenador)', 'asignado', '[id].tsx');
    expect(codigo).not.toMatch(/cargarCuota|lecturaDeCuota/);
  });

  it('el del panel carga ficha y cuota, y NO rutinas ni progreso', () => {
    const codigo = leer('(panel)', 'socio', '[id].tsx');
    expect(codigo).toMatch(/cargarSocio\(/);
    expect(codigo).toMatch(/cargarCuota\(/);
    expect(codigo).not.toMatch(/cargarRutinas|cargarProgreso/);
  });

  it('cada uno importa de SU fuente', () => {
    expect(leer('(entrenador)', 'asignado', '[id].tsx')).toMatch(/src\/entrenador\/fuente/);
    expect(leer('(panel)', 'socio', '[id].tsx')).toMatch(/src\/panel\/fuente/);
    // Cruzarlas es la otra forma de acabar viendo la pantalla equivocada.
    expect(leer('(entrenador)', 'asignado', '[id].tsx')).not.toMatch(/src\/panel\//);
    expect(leer('(panel)', 'socio', '[id].tsx')).not.toMatch(/src\/entrenador\//);
  });
});

// --- El recorrido con datos, tal y como esta el fixture de desarrollo -------

function asignado(nombre: string, apellido: string, numero: number, id: string): AssignedMember {
  return {
    id,
    memberNumber: numero,
    firstName: nombre,
    lastName: apellido,
    email: null,
    phone: null,
    birthDate: null,
    status: 'active',
    joinedAt: '2026-01-10',
    leftAt: null,
    hasAccount: false,
    assignmentId: `asig-${id}`,
    assignedAt: '2026-05-04',
  } as AssignedMember;
}

const rutina = (nombre: string, ejercicios: number): AssignedRoutine =>
  ({
    id: `r-${nombre}`,
    name: nombre,
    description: null,
    items: Array.from({ length: ejercicios }, () => ({})),
    activeAssignments: 1,
    status: 'active',
    assignmentId: `ar-${nombre}`,
    assignedAt: '2026-07-01',
  }) as AssignedRoutine;

/**
 * Los cuatro socios del entrenador del fixture de DESARROLLO, con lo que de
 * verdad tienen colgando. Comprobado contra la API antes del ensayo.
 */
const FIXTURE = {
  socios: [
    asignado('Carmen', 'Delgado', 3, 'id-carmen'),
    asignado('Lucia', 'Fernandez', 1, 'id-lucia'),
    asignado('Ruben', 'Iglesias', 4, 'id-ruben'),
    asignado('Javier', 'Ortega', 2, 'id-javier'),
  ],
  rutinas: {
    'id-lucia': [rutina('Movilidad de hombro', 3), rutina('Fuerza principiantes', 5)],
    'id-carmen': [] as AssignedRoutine[],
  } as Record<string, AssignedRoutine[]>,
  progreso: {} as Record<string, BodyMetric[]>,
};

describe('el recorrido real del fixture: Lucía y Carmen', () => {
  it('la lista sale ordenada por apellido, NO por numero de socio', () => {
    // Es lo que se ve en el telefono: Delgado(3), Fernandez(1), Iglesias(4),
    // Ortega(2). Si saliera 1,2,3,4 seria que no se esta ordenando.
    const lista = ordenados(FIXTURE.socios);
    expect(lista.map((s) => s.lastName)).toEqual([
      'Delgado',
      'Fernandez',
      'Iglesias',
      'Ortega',
    ]);
    expect(lista.map((s) => s.memberNumber)).not.toEqual([1, 2, 3, 4]);
  });

  it('tocar a Lucía lleva a SU detalle del entrenador', () => {
    const lucia = FIXTURE.socios.find((s) => s.firstName === 'Lucia')!;
    expect(lineaDeAsignado(lucia)).toEqual({ titulo: 'Lucia Fernandez', detalle: 'nº 1' });
    expect(RUTAS_INTERNAS.socioDelEntrenador(lucia.id)).toBe('/asignado/id-lucia');
  });

  it('y ahi se ven sus DOS rutinas', () => {
    const rutinas = FIXTURE.rutinas['id-lucia']!;
    expect(rutinas).toHaveLength(2);
    expect(rutinas.map((r) => r.name)).toEqual(['Movilidad de hombro', 'Fuerza principiantes']);
    expect(rutinas.map((r) => r.items.length)).toEqual([3, 5]);
  });

  it('con su medición vacía, porque en desarrollo no hay ninguna', () => {
    expect(ultimaMedicion(FIXTURE.progreso['id-lucia'] ?? [])).toBeNull();
  });

  it('Carmen tiene el doble estado vacío: ni rutinas ni mediciones', () => {
    const carmen = FIXTURE.socios.find((s) => s.firstName === 'Carmen')!;
    expect(RUTAS_INTERNAS.socioDelEntrenador(carmen.id)).toBe('/asignado/id-carmen');
    expect(FIXTURE.rutinas['id-carmen']).toEqual([]);
    expect(ultimaMedicion(FIXTURE.progreso['id-carmen'] ?? [])).toBeNull();
  });

  it('una medición vacía no produce ni una fila de valores', () => {
    expect(valoresDeMedicion({
      id: 'x',
      measuredAt: '2026-08-01T00:00:00.000Z',
      weightKg: null,
      bodyFatPercent: null,
      chestCm: null,
      waistCm: null,
      hipCm: null,
      armCm: null,
      thighCm: null,
      notes: null,
      consentVersion: '1',
    } as BodyMetric)).toEqual([]);
  });
});
