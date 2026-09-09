import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';

/**
 * PARITY-5: la certificación, derivada del PRODUCTO y no de los decoradores.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL DECORADOR NO ES EL PRODUCTO. ESTE FICHERO EXISTE POR ESO.             │
 * │                                                                          │
 * │ Las fases anteriores midieron la paridad contando metodos de             │
 * │ `@gymlab/api-client` y leyendo `@Roles`. Eso deja CIEGO justo lo que hay │
 * │ que ver: un metodo puede estar en las dos aplicaciones y llegarle a      │
 * │ ROLES DISTINTOS, porque quien decide a que pantalla entra cada rol no es │
 * │ el decorador — es `AREA_DE_ROL` y la navegacion de cada aplicacion.      │
 * │                                                                          │
 * │ Caso real: `training.controller.ts` es `@Roles('owner','trainer')`, pero │
 * │ en el panel web las rutinas viven en `/entrenador/*`, que es area        │
 * │ `entrenador`, y `AREA_DE_ROL.owner` es `panel`: el dueño es REDIRIGIDO   │
 * │ fuera. En el movil, en cambio, tiene sus dos filas en el Panel.          │
 * │                                                                          │
 * │ El gate de metodos se quedaba verde —los usa el entrenador en las dos—   │
 * │ y la diferencia por rol no la veia nadie.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Aqui se compara DESTINO A DESTINO y ROL A ROL, con las diferencias
 * aceptadas escritas una a una y con su motivo. Una diferencia sin fila en
 * esta tabla pone el fichero en rojo.
 */

const MOVIL = join(__dirname, '..', '..');
const WEB = join(MOVIL, '..', 'web');
const APP = join(MOVIL, 'app');

const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

const leer = (base: string, ...partes: string[]) =>
  sinComentarios(readFileSync(join(base, ...partes), 'utf8'));

const ROLES: Role[] = ['owner', 'receptionist', 'trainer', 'member'];

// --- Lo que el PANEL WEB ofrece a cada rol --------------------------------

/**
 * El area de cada rol, leida de `apps/web/src/lib/areas.ts`.
 *
 * No se copia: se extrae. Si alguien cambiara el area de un rol en la web,
 * esto tiene que enterarse.
 */
function areaDeRolEnWeb(): Record<string, string> {
  const codigo = leer(WEB, 'src', 'lib', 'areas.ts');
  const bloque = codigo.match(/AREA_DE_ROL[^=]*=\s*\{([^}]*)\}/)?.[1] ?? '';
  const mapa: Record<string, string> = {};
  for (const m of bloque.matchAll(/(\w+):\s*'(\w+)'/g)) mapa[m[1]!] = m[2]!;
  return mapa;
}

/** Los destinos del Panel web, con su `soloDueno`. Extraidos, no copiados. */
function destinosDelPanelWeb(): { href: string; soloDueno: boolean }[] {
  const codigo = leer(WEB, 'src', 'lib', 'navegacion.ts');
  const bloque = codigo.match(/DESTINOS_PANEL[^=]*=\s*\[([\s\S]*?)\n\] as const/)?.[1] ?? '';
  const salida: { href: string; soloDueno: boolean }[] = [];
  for (const entrada of bloque.split(/\},?\s*\{/)) {
    const href = entrada.match(/href:\s*'([^']+)'/)?.[1];
    if (!href) continue;
    salida.push({ href, soloDueno: /soloDueno:\s*true/.test(entrada) });
  }
  return salida;
}

/**
 * Cada fila del Panel móvil con la condición que la envuelve, si la hay.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SABER QUE ESTA «DETRAS DE ALGO» NO BASTA.                               │
 * │                                                                          │
 * │ La primera version solo decia si una fila era condicional. Cambiando su  │
 * │ guarda por `{true ? (…)}` —que le devuelve Planes a recepcion— el gate   │
 * │ se quedaba VERDE. Lo que hay que afirmar es DE QUE depende cada fila.    │
 * │                                                                          │
 * │ Contar llaves tampoco valia: `onPress={() => …}` abre llaves a docenas.  │
 * │ Se cuentan los `? (` y los `) : null}`, y se lee el titulo ANTES de      │
 * │ aplicar los del propio trozo — el `? (` del bloque siguiente vive en la  │
 * │ cola de este, y contarlo antes marcaba la fila anterior.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function filasDelPanelConSuGuarda(): { titulo: string; guarda: string | null }[] {
  const codigo = leer(APP, '(panel)', 'panel.tsx');
  const filas: { titulo: string; guarda: string | null }[] = [];
  const abiertas: string[] = [];

  for (const trozo of codigo.split(/(<FilaDeAccion)/)) {
    if (trozo === '<FilaDeAccion') continue;
    const titulo = trozo.match(/^[\s\S]{0,200}?titulo="([^"]+)"/)?.[1];
    if (titulo) filas.push({ titulo, guarda: abiertas[abiertas.length - 1] ?? null });
    for (const m of trozo.matchAll(/\{\s*(\w+)\s*\?\s*\(|\)\s*:\s*null\}/g)) {
      if (m[1]) abiertas.push(m[1]);
      else abiertas.pop();
    }
  }
  return filas;
}

describe('el mapa de la web se lee del código, no de la memoria', () => {
  it('cada rol tiene un área declarada', () => {
    const mapa = areaDeRolEnWeb();
    for (const rol of ROLES) expect(mapa[rol], `sin área para ${rol}`).toBeTruthy();
    expect(mapa.owner).toBe('panel');
    expect(mapa.receptionist).toBe('panel');
    expect(mapa.trainer).toBe('entrenador');
    expect(mapa.member).toBe('socio');
  });

  it('el Panel web tiene siete destinos, cuatro de ellos sólo del dueño', () => {
    const destinos = destinosDelPanelWeb();
    expect(destinos.map((d) => d.href)).toEqual([
      '/socios',
      '/personal',
      '/planes',
      '/accesos',
      '/configuracion',
      // PARITY-5: entrenamiento tambien es del dueño, y le faltaba la puerta.
      '/entrenador/rutinas',
      '/entrenador/ejercicios',
    ]);
    expect(destinos.filter((d) => d.soloDueno).map((d) => d.href)).toEqual([
      '/planes',
      '/configuracion',
      '/entrenador/rutinas',
      '/entrenador/ejercicios',
    ]);
  });

  /*
   * La consecuencia que nadie habia mirado: un rol solo llega a las rutas de
   * SU area. `destinoSegunArea` devuelve la puerta de su area para cualquier
   * otra, y `RutaPrivada` redirige. No es seguridad —lo dice el propio
   * fichero— pero SI es el alcance del producto.
   */
  it('en la web, el área del rol decide a qué rutas llega', () => {
    const codigo = leer(WEB, 'src', 'lib', 'areas.ts');
    expect(codigo).toMatch(/if \(area === AREA_DE_ROL\[rol\]\) return null;/);
    expect(codigo).toMatch(/return inicioPara\(rol\);/);
    // Y la ruta de entrenamiento pertenece al area del entrenador.
    expect(codigo).toMatch(/ruta === '\/entrenador' \|\| ruta\.startsWith\('\/entrenador\/'\)/);
  });
});

// --- Diferencias entre el panel y el movil, una a una ---------------------

interface Diferencia {
  /** Qué difiere, en una línea. */
  que: string;
  /** Quién la tiene en cada aplicación. */
  web: string;
  movil: string;
  /** Por qué se acepta, o qué decisión falta. */
  motivo: string;
  estado: 'aceptada' | 'pendiente-de-decision';
}

const DIFERENCIAS: Diferencia[] = [
  {
    que: 'Entrada manual de un código en el escáner',
    web: 'campo de texto + botón «Comprobar»',
    movil: 'no existe: sólo cámara',
    motivo:
      'Lo dice la propia ayuda del panel: «Entrada manual, para soporte y ' +
      'pruebas. En el mostrador se usa la camara». Un token firmado no se ' +
      'dicta en voz alta. No es una capacidad de mostrador.',
    estado: 'aceptada',
  },
  {
    que: 'Encender / apagar la cámara',
    web: 'dos botones',
    movil: 'la cámara se abre con la pantalla',
    motivo:
      'El navegador exige un gesto para abrir la camara; el telefono no. Es ' +
      'adaptacion de plataforma, no capacidad.',
    estado: 'aceptada',
  },
  {
    que: 'Privacidad desde Inicio del socio',
    web: 'tarjeta «Ver y decidir» en `/socio`',
    movil: 'la pestaña Perfil está siempre visible',
    motivo:
      'La web no tiene barra de pestañas y necesita el atajo. En el movil, ' +
      'Privacidad esta a un toque desde cualquier pantalla del socio.',
    estado: 'aceptada',
  },
];

describe('las diferencias entre el panel y el móvil están todas escritas', () => {
  it('cada una dice quién la tiene y por qué', () => {
    for (const d of DIFERENCIAS) {
      expect(d.web, d.que).toBeTruthy();
      expect(d.movil, d.que).toBeTruthy();
      expect(d.motivo.length, `${d.que}: el motivo es demasiado corto`).toBeGreaterThan(60);
    }
  });

  it('ninguna queda pendiente de decisión', () => {
    // Las dos que lo estaban se cerraron: entrenamiento se abrio al dueño en la
    // web, y Planes dejo de ser una seccion de recepcion en el movil.
    expect(DIFERENCIAS.filter((d) => d.estado === 'pendiente-de-decision')).toEqual([]);
  });
});

/**
 * ── EL DUEÑO Y EL ENTRENAMIENTO ────────────────────────────────────────────
 *
 * Lo compartido se le abre; lo exclusivo del entrenador, no.
 */
describe('el dueño entrena en las dos, y no invade lo del entrenador', () => {
  it('la web le da Rutinas y Ejercicios', () => {
    const areas = leer(WEB, 'src', 'lib', 'areas.ts');
    expect(areas).toMatch(/RUTAS_DE_ENTRENAMIENTO/);
    expect(areas).toMatch(
      /esRutaDeEntrenamiento\(ruta\) && ROLES_DE_ENTRENAMIENTO\.includes\(rol\)/,
    );

    const destinos = destinosDelPanelWeb().map((d) => d.href);
    expect(destinos).toContain('/entrenador/rutinas');
    expect(destinos).toContain('/entrenador/ejercicios');
  });

  it('y el móvil también, con la misma regla', () => {
    expect(leer(MOVIL, 'src', 'entrenamiento', 'permisos.ts')).toMatch(
      /rol === 'owner' \|\| rol === 'trainer'/,
    );
    // Las dos filas dependen de `entrena`, que sale de `puedeEntrenar`.
    const filas = filasDelPanelConSuGuarda();
    expect(filas.find((f) => f.titulo === 'Rutinas')?.guarda).toBe('entrena');
    expect(filas.find((f) => f.titulo === 'Ejercicios')?.guarda).toBe('entrena');
    expect(leer(APP, '(panel)', 'panel.tsx')).toMatch(
      /const entrena =[^;]*puedeEntrenar\(estado\.rol\)/,
    );
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ «MIS SOCIOS» ES DEL ENTRENADOR Y SOLO SUYA.                          │
   * │                                                                      │
   * │ Cuelga de `/me/trainer/*`, que es `@Roles('trainer')`: el servidor le │
   * │ contestaria 403 al dueño. Abrirle el area entera habria sido lo facil │
   * │ y lo equivocado.                                                     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('«Mis socios» NO se le abre: ni la ruta ni el destino', () => {
    const areas = leer(WEB, 'src', 'lib', 'areas.ts');
    const compartidas = areas.match(/RUTAS_DE_ENTRENAMIENTO = \[([^\]]*)\]/)?.[1] ?? '';
    expect(compartidas).not.toMatch(/'\/entrenador'/);
    expect(compartidas).not.toMatch(/'\/entrenador\/socio'/);

    // Ni aparece en su navegacion.
    expect(destinosDelPanelWeb().map((d) => d.href)).not.toContain('/entrenador');

    // Y en el movil, su area sigue gateada por rol de entrenador.
    expect(leer(APP, '(entrenador)', '_layout.tsx')).toMatch(/puedeEntrarEnArea|Redirect/);
  });

  it('recepción sigue fuera de entrenamiento en las dos', () => {
    const areas = leer(WEB, 'src', 'lib', 'areas.ts');
    expect(areas).toMatch(/ROLES_DE_ENTRENAMIENTO[^=]*=\s*\[\s*'owner',\s*'trainer'\s*\]/);
    // `puedeEntrenar` no la admite, y de ahi salen las filas del Panel movil.
    expect(leer(MOVIL, 'src', 'entrenamiento', 'permisos.ts')).not.toMatch(/'receptionist'/);
  });

  it('y el dueño asigna rutinas desde la ficha del socio, en las dos', () => {
    // Movil: la tarjeta del Panel, tras `entrena`.
    expect(leer(APP, '(panel)', 'socio', '[id]', 'index.tsx')).toMatch(/RutinasDelSocio/);
    // Web: la misma tarjeta del entrenador, reutilizada y acotada al dueño.
    const ficha = leer(WEB, 'src', 'app', 'socios', 'ficha', 'page.tsx');
    expect(ficha).toMatch(/RutinasDelSocio/);
    expect(ficha).toMatch(/rolDeLaSesion === 'owner'/);
  });
});

/**
 * ── RECEPCION Y LOS PLANES ─────────────────────────────────────────────────
 *
 * Administrar precios es del dueño. Elegir un plan al dar de alta una cuota es
 * del mostrador, y eso NO se toca.
 */
describe('recepción no administra planes, pero sigue eligiendo plan', () => {
  it('la sección es del dueño en las dos', () => {
    expect(destinosDelPanelWeb().find((d) => d.href === '/planes')?.soloDueno).toBe(true);

    /*
     * Y en el movil, la fila de Planes depende de `administraPlanes` — que se
     * declara con `puedeEditarPlanes`, y ese es del dueño. Comprobar solo que
     * «esta detras de algo» dejaba pasar un `{true ? (…)}`.
     */
    const planes = filasDelPanelConSuGuarda().find((f) => f.titulo === 'Planes');
    expect(planes?.guarda).toBe('administraPlanes');
    expect(leer(APP, '(panel)', 'panel.tsx')).toMatch(
      /const administraPlanes =[^;]*puedeEditarPlanes\(estado\.rol\)/,
    );
    expect(leer(MOVIL, 'src', 'socios', 'permisos.ts')).toMatch(
      /export function puedeEditarPlanes\(rol: Role\): boolean \{\s*return rol === 'owner';/,
    );
  });

  it('y quien llegue por un enlace directo lee por qué, no la lista', () => {
    const pantalla = leer(APP, '(panel)', 'planes', 'index.tsx');
    expect(pantalla).toMatch(/if \(!puedeEditar\)/);
    expect(pantalla).toMatch(/Los precios los decide el propietario/);
  });

  /*
   * Lo que NO puede romperse al quitar la seccion: la cuota carga los planes
   * sin preguntar por el rol, porque el `GET` es `owner` + `receptionist`.
   */
  it('la cuota sigue cargando los planes sin mirar el rol', () => {
    const cuota = leer(APP, '(panel)', 'socio', '[id]', 'cuota.tsx');
    expect(cuota).toMatch(/cargarPlanes\(gymId\)/);
    expect(cuota).not.toMatch(/puedeEditarPlanes|administraPlanes/);
    // Y en la web, igual: el formulario de la cuota los lista para los dos.
    expect(leer(WEB, 'src', 'app', 'socios', 'ficha', 'cuota.tsx')).toMatch(
      /api\s*\.\s*billing\s*\.\s*listPlans/,
    );
  });
});

// --- Lo corregido por esta auditoria --------------------------------------

describe('lo que PARITY-5 encontró y arregló', () => {
  /*
   * El panel pone al pie de su Progreso un enlace a Privacidad, «para que
   * quien se pregunte por que dejaron de tomarle medidas tenga aqui el
   * camino». En el movil no habia nada: la capacidad estaba en Perfil, pero
   * desde esta pantalla no se llegaba ni se explicaba.
   */
  it('el Progreso del socio lleva a Privacidad, como en el panel', () => {
    const codigo = leer(APP, '(socio)', 'progreso.tsx');
    expect(codigo).toMatch(/perfil\/privacidad/);
    /*
     * Y RENDERIZADO, no solo definido. Una primera version comprobaba que el
     * fichero mencionara la ruta: borrar los dos `<PieDePrivacidad />` la
     * dejaba en verde con la funcion muerta dentro.
     *
     * Dos veces: la pantalla tiene dos salidas —sin mediciones y con ellas— y
     * la de sin mediciones es justo donde alguien se pregunta por que no le
     * miden.
     */
    expect(codigo.match(/<PieDePrivacidad \/>/g) ?? []).toHaveLength(2);
    // Y sigue sin aceptar ni revocar nada desde aqui: eso vive en un solo sitio.
    expect(codigo).not.toMatch(/aceptarPrivacidad|retirarPrivacidad/);
  });

  /*
   * `no-admitido` decia «Esta app es para socios» y «tu sitio es el panel
   * web». Desde STAFF-1 el rol no decide si se entra, y este estado solo
   * aparece cuando la cuenta no tiene NINGUNA pertenencia — el mismo caso que
   * `SinGimnasios` del panel.
   */
  it('«sin gimnasio» ya no le dice a un dueño que la app es para socios', () => {
    const codigo = leer(APP, 'no-admitido.tsx');
    expect(codigo).not.toMatch(/Esta app es para socios/);
    expect(codigo).not.toMatch(/tu sitio es el panel web/i);
    expect(codigo).toMatch(/no pertenece a ningún gimnasio/);
    // Y dice lo mismo que el panel: puede ser una revocacion o una invitacion
    // sin aceptar.
    expect(codigo).toMatch(/retirado el acceso/);
    expect(codigo).toMatch(/invitación/);
  });

  it('y el panel sigue diciendo lo mismo, que es de donde sale el texto', () => {
    const codigo = leer(WEB, 'src', 'componentes', 'ruta-privada.tsx');
    expect(codigo).toMatch(/no pertenece a ningun gimnasio/i);
    expect(codigo).toMatch(/retirado el acceso/);
  });
});

// --- API-ONLY: existe en la API y NO es hueco -----------------------------

describe('lo que existe en la API y no es producto', () => {
  const API_ONLY = [
    {
      que: 'GymSettingsController',
      donde: 'access/access.controller.ts',
      patron: /@Controller\('gyms\/:gymId\/settings'\)/,
    },
    {
      que: 'Borrar una rutina',
      donde: 'training/training.controller.ts',
      patron: /@Delete\(':id'\)/,
    },
    {
      que: 'Notas internas de un socio',
      donde: 'members/members.controller.ts',
      patron: /@Post\(':id\/notes'\)/,
    },
    {
      que: 'Borrar una medición',
      donde: 'progress/progress.controller.ts',
      patron: /@Delete\(':id'\)/,
    },
  ];

  it('existen en la API', () => {
    for (const e of API_ONLY) {
      const codigo = readFileSync(join(MOVIL, '..', 'api', 'src', e.donde), 'utf8');
      expect(codigo, `${e.que} deberia existir en ${e.donde}`).toMatch(e.patron);
    }
  });

  it('y NINGUNA de las dos aplicaciones las usa: no son huecos', () => {
    const PROHIBIDOS =
      /api\s*\.\s*(?:settings|ajustes)|entrenamiento\s*\.\s*(?:eliminarRutina|borrarRutina)|members\s*\.\s*(?:notas|notes|crearNota)|progreso\s*\.\s*(?:eliminar|borrar)/;
    const recorrer = (raiz: string): string[] => {
      const malos: string[] = [];
      const anda = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) {
            if (!/node_modules|\.next|out|\.expo/.test(e.name)) anda(p);
          } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
            if (PROHIBIDOS.test(sinComentarios(readFileSync(p, 'utf8')))) malos.push(p);
          }
        }
      };
      anda(raiz);
      return malos;
    };
    expect(recorrer(join(WEB, 'src'))).toEqual([]);
    expect(recorrer(join(MOVIL, 'src'))).toEqual([]);
    expect(recorrer(APP)).toEqual([]);
  });

  it('`api-client` tampoco las expone: el producto no puede llamarlas', () => {
    const cliente = readFileSync(
      join(MOVIL, '..', '..', 'packages', 'api-client', 'src', 'index.ts'),
      'utf8',
    );
    expect(cliente).not.toMatch(/settings|ajustes/i);
  });
});

// --- Que ninguna pantalla del movil se quede sin gate ----------------------

describe('cada pantalla del móvil está dentro de un grupo con gate', () => {
  it('las rutas privadas viven en `(panel)`, `(socio)`, `(entrenador)` o `(entrenamiento)`', () => {
    const PUBLICAS = [
      'index.tsx',
      'entrar.tsx',
      'recuperar.tsx',
      'restablecer.tsx',
      'invitacion.tsx',
      'elegir-gimnasio.tsx',
      'no-admitido.tsx',
      'problema.tsx',
      '+native-intent.ts',
      '_layout.tsx',
    ];
    const sueltas: string[] = [];
    for (const e of readdirSync(APP, { withFileTypes: true })) {
      if (e.isDirectory()) continue;
      if (PUBLICAS.includes(e.name)) continue;
      sueltas.push(e.name);
    }
    expect(sueltas, 'pantallas en la raíz sin gate de grupo').toEqual([]);
  });

  it('y las de Perfil las gatea su propio layout', () => {
    expect(() => statSync(join(APP, 'perfil', '_layout.tsx'))).not.toThrow();
    expect(leer(APP, 'perfil', '_layout.tsx')).toMatch(/puedeEntrarEnArea|Redirect/);
  });
});
