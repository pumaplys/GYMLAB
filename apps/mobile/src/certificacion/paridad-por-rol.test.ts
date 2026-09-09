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
 * Qué filas del Panel móvil están detrás de una condición, y cuáles no.
 *
 * Se recorre el JSX contando llaves: una fila cuenta como condicionada si su
 * `titulo=` cae dentro de un bloque `{algo ? (`. Es lo que de verdad decide
 * quien ve que, y no depende de como se llame la variable que lo guarda.
 */
function filasCondicionadasDelPanel(): string[] {
  const codigo = leer(APP, '(panel)', 'panel.tsx');
  /*
   * Se corta por fila y se mira lo que hay ENTRE el final de la anterior y el
   * principio de esta: si ahi se abre un `? (`, la fila esta condicionada.
   *
   * Contar llaves no valia —`onPress={() => …}` y `style={({ pressed }) => …}`
   * abren llaves a docenas— y la primera version marcaba como condicionadas
   * filas que no lo estan.
   */
  const condicionadas: string[] = [];
  let dentro = 0;

  // Se recorre en orden, contando los `? (` que se abren y los `) : null}` que
  // se cierran. Dos filas dentro del MISMO bloque —Rutinas y Ejercicios— tienen
  // que contar las dos; mirar solo lo que hay justo antes de cada fila dejaba
  // fuera la segunda.
  for (const trozo of codigo.split(/(<FilaDeAccion)/)) {
    if (trozo === '<FilaDeAccion') continue;
    /*
     * PRIMERO se lee el titulo con el estado que traia, y DESPUES se aplican
     * las aperturas y cierres del trozo: el `? (` del bloque siguiente vive en
     * la cola de este, y contarlo antes marcaba como condicionada la fila
     * anterior — «Personal» salia gateada y no lo esta.
     */
    const titulo = trozo.match(/^[\s\S]{0,200}?titulo="([^"]+)"/)?.[1];
    if (titulo && dentro > 0) condicionadas.push(titulo);
    for (const m of trozo.matchAll(/\?\s*\(|\)\s*:\s*null\}/g)) {
      dentro += m[0].startsWith('?') ? 1 : -1;
    }
  }
  return condicionadas;
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

  it('el Panel web tiene cinco destinos, dos de ellos sólo del dueño', () => {
    const destinos = destinosDelPanelWeb();
    expect(destinos.map((d) => d.href)).toEqual([
      '/socios',
      '/personal',
      '/planes',
      '/accesos',
      '/configuracion',
    ]);
    expect(destinos.filter((d) => d.soloDueno).map((d) => d.href)).toEqual([
      '/planes',
      '/configuracion',
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
    que: 'Rutinas y Ejercicios',
    web: 'sólo el entrenador (viven en el área `entrenador`; al dueño lo redirige)',
    movil: 'entrenador y DUEÑO (filas del Panel tras `puedeEntrenar`)',
    motivo:
      'La API dice `@Roles("owner","trainer")` y PARITY-1 lo tomo como alcance. ' +
      'El producto web no se lo ofrece al dueño. O se le abre en la web, o se le ' +
      'quita del movil: es una decision de producto, no de codigo.',
    estado: 'pendiente-de-decision',
  },
  {
    que: 'Pantalla de Planes',
    web: 'sólo el dueño (`soloDueno: true` en DESTINOS_PANEL)',
    movil: 'dueño y RECEPCIÓN (la lista, sin crear ni editar)',
    motivo:
      'Recepcion lee los planes en las dos —los necesita para dar de alta una ' +
      'cuota— pero en la web no tiene pantalla propia. Misma familia que lo ' +
      'anterior y mucho menor: quitar la fila no le resta ninguna capacidad.',
    estado: 'pendiente-de-decision',
  },
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

  /*
   * Las dos pendientes se afirman TAL Y COMO ESTAN HOY. Si alguien toca
   * cualquiera de los dos lados sin decidir, esto se pone rojo y obliga a
   * releer la tabla en vez de dejar que la diferencia se cuele otra vez.
   */
  it('PENDIENTE: el dueño entrena en el móvil y no en la web', () => {
    expect(leer(MOVIL, 'src', 'entrenamiento', 'permisos.ts')).toMatch(
      /rol === 'owner' \|\| rol === 'trainer'/,
    );
    expect(leer(APP, '(panel)', 'panel.tsx')).toMatch(/puedeEntrenar\(/);
    // Y en la web NO hay ningun destino de entrenamiento en el Panel.
    expect(destinosDelPanelWeb().map((d) => d.href)).not.toContain('/entrenador/rutinas');
  });

  it('PENDIENTE: recepción ve Planes en el móvil y no en la web', () => {
    expect(destinosDelPanelWeb().find((d) => d.href === '/planes')?.soloDueno).toBe(true);
    /*
     * Y en el movil, Planes NO esta entre las filas condicionadas. Se mide
     * cuales lo estan en vez de buscar un texto: envolver la fila en
     * `{loQueSea ? (…) : null}` tiene que poner esto en rojo, y una primera
     * version que buscaba `rol === 'owner'` no lo detectaba.
     */
    expect(filasCondicionadasDelPanel()).toEqual(['Configuración', 'Rutinas', 'Ejercicios']);
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
