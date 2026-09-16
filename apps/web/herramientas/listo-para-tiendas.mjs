import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ¿PUEDE RINDA PRESENTARSE A UNA TIENDA HOY?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ COMPRUEBA ESTADO REAL, NO LA PRESENCIA DE UNA PALABRA.                   │
 * │                                                                          │
 * │ La primera version buscaba la cadena «Borrador.» en las paginas. Eso     │
 * │ valia mientras los textos eran borradores: detectaba lo unico que habia  │
 * │ que detectar. Ahora que hay textos de lanzamiento, un gate asi se pondria│
 * │ verde con solo BORRAR EL AVISO — sin que nada del producto cambiara.     │
 * │                                                                          │
 * │ Asi que mira otra cosa: que exista la identidad del prestador, que los   │
 * │ textos no lleven marcadores sin rellenar, que el consentimiento de salud │
 * │ vigente NO sea borrador ni una plantilla de prueba, que los documentos   │
 * │ de responsabilidad existan, que haya purga de retencion y que el borrado │
 * │ de cuenta siga en pie.                                                   │
 * │                                                                          │
 * │ NO INVENTAR VALORES PARA PONERLO VERDE. Si falta el identificador fiscal │
 * │ del prestador, esto tiene que quedarse rojo diciendo exactamente eso.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/listo-para-tiendas.mjs
 *
 * Sale 0 si RINDA puede presentarse; 1 si no. Enumera SIEMPRE todo lo que
 * falta, no solo lo primero: quien vaya a resolverlo necesita la lista entera,
 * no descubrirla de uno en uno.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(AQUI, '..');
const RAIZ = resolve(WEB, '..', '..');

const pendientes = [];
const anotar = (que, porque) => pendientes.push({ que, porque });

/**
 * Las variables del `.env` de la raiz, leidas a mano.
 *
 * Sin dependencias: este guion tiene que poder ejecutarse en un arbol recien
 * clonado, y anadir `dotenv` al panel solo para esto seria pagar una dependencia
 * de produccion por una herramienta. El formato que hace falta es
 * `CLAVE=valor`, que es el que usa el fichero.
 */
function entorno() {
  const valores = { ...process.env };
  const fichero = join(RAIZ, '.env');
  if (!existsSync(fichero)) return valores;

  for (const linea of readFileSync(fichero, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    // Lo del entorno gana: es lo que veria el build de verdad.
    if (valores[clave] === undefined) valores[clave] = limpia.slice(corte + 1).trim();
  }
  return valores;
}

const ENV = entorno();
const puesta = (clave) => typeof ENV[clave] === 'string' && ENV[clave].trim().length > 0;

const leer = (...partes) => {
  const ruta = join(...partes);
  return existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
};

/**
 * Marcadores sin rellenar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ «TODO» ES UNA PALABRA ESPANOLA, Y ESTE GATE ESCRIBE EN ESPANOL.         │
 * │                                                                          │
 * │ La primera version buscaba `\bTODO\b` y salto contra un comentario que   │
 * │ decia «TODO LO QUE DESCRIBE SALE DE AUDITAR EL PRODUCTO». Un guardian    │
 * │ que grita por una palabra corriente del idioma se desactiva a la tercera │
 * │ vez, y entonces deja de guardar nada.                                    │
 * │                                                                          │
 * │ Un marcador de verdad lleva dos puntos o parentesis detras —`TODO:`,     │
 * │ `TODO(quien sea)`— o es `@todo`. `FIXME` no es espanol y se deja tal cual. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `{{...}}` se excluye a proposito: es la sustitucion legitima de la plantilla
 * de consentimiento (`{{responsable}}`), que se resuelve al publicar el
 * documento de cada gimnasio.
 */
const MARCADORES = [
  /\[\[[A-Z_]+\]\]/,
  /\bTODO\s*[:(]/,
  /@todo\b/i,
  /\bFIXME\b/,
  /\bXXXX?\b/,
  /\blorem ipsum\b/i,
];

function sinRellenar(texto) {
  return MARCADORES.filter((m) => m.test(texto)).map((m) => String(m));
}

// ─── 1. Identidad del prestador ──────────────────────────────────────────────
{
  const falta = [];
  if (!puesta('NEXT_PUBLIC_PRESTADOR_NOMBRE')) falta.push('NEXT_PUBLIC_PRESTADOR_NOMBRE');
  if (!puesta('NEXT_PUBLIC_PRESTADOR_DOMICILIO')) falta.push('NEXT_PUBLIC_PRESTADOR_DOMICILIO');

  if (falta.length > 0) {
    anotar(
      'falta la identidad del prestador en la configuración',
      `sin ${falta.join(' ni ')} el aviso legal no identifica a nadie`,
    );
  }

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL IDENTIFICADOR FISCAL TIENE MENSAJE PROPIO, Y ES LO PEDIDO.        │
   * │                                                                      │
   * │ Es el unico bloqueo que depende de un dato que nadie del equipo       │
   * │ tecnico puede conseguir. Mezclarlo con los demas haria que se leyera  │
   * │ como «ya lo arreglara alguien»; separado, dice a quien le toca.       │
   * │                                                                      │
   * │ NO SE INVENTA, no se pide por chat y no se escribe en el codigo.      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  if (!puesta('NEXT_PUBLIC_PRESTADOR_NIF')) {
    anotar(
      'FALTA IDENTIFICADOR FISCAL DEL PRESTADOR',
      'ponlo en NEXT_PUBLIC_PRESTADOR_NIF antes de construir la release. NO se inventa',
    );
  }
}

// ─── 2. Las páginas legales, tal y como se sirven ────────────────────────────
{
  const paginas = [
    ['privacidad', 'las dos tiendas exigen una URL pública de política de privacidad'],
    ['aviso-legal', 'identifica a quien presta el servicio'],
    ['soporte', 'App Store exige una Support URL'],
    ['eliminar-cuenta', 'Google Play y Apple exigen una vía de borrado de cuenta accesible'],
  ];

  for (const [ruta, porque] of paginas) {
    const codigo = leer(WEB, 'src', 'app', ruta, 'page.tsx');
    if (!codigo) {
      anotar(`no existe la página /${ruta}`, porque);
      continue;
    }

    if (/<strong>Borrador\.<\/strong>/.test(codigo)) {
      anotar(`/${ruta} se sirve marcada BORRADOR`, 'no puede darse como definitiva mientras lo diga');
    }

    const marcadores = sinRellenar(codigo);
    if (marcadores.length > 0) {
      anotar(`/${ruta} tiene marcadores sin rellenar`, `coinciden ${marcadores.join(', ')}`);
    }
  }

  /*
   * Que la identidad NO este escrita en el codigo. Es la otra mitad de la
   * comprobacion 1: de nada sirve exigir la variable de entorno si alguien
   * pega el nombre y el domicilio en el JSX «mientras tanto».
   */
  for (const ruta of ['privacidad', 'aviso-legal']) {
    const codigo = leer(WEB, 'src', 'app', ruta, 'page.tsx');
    if (codigo && !/from '@\/lib\/prestador'/.test(codigo)) {
      anotar(
        `/${ruta} no lee la identidad de la configuración`,
        'debe venir de lib/prestador.ts, no estar escrita en la página',
      );
    }
  }
}

// ─── 3. Buzones de contacto ──────────────────────────────────────────────────
{
  const contacto = leer(WEB, 'src', 'lib', 'contacto.ts');
  if (!contacto) {
    anotar('falta src/lib/contacto.ts', 'es donde viven las direcciones de contacto');
  } else {
    for (const constante of ['CORREO_DE_PRIVACIDAD', 'CORREO_DE_SOPORTE']) {
      const m = new RegExp(`${constante}\\s*=\\s*'([^']+)'`).exec(contacto);
      if (!m || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m[1])) {
        anotar(`${constante} no es una dirección válida`, 'las tiendas piden un contacto que exista');
      }
    }
  }
}

// ─── 4. El consentimiento de datos de salud ──────────────────────────────────
{
  /*
   * Se pregunta a la BASE DE DATOS de desarrollo, que es donde vive el estado
   * real de la plantilla. Si no hay base delante no se calla: se dice que no
   * se ha podido comprobar, que NO es lo mismo que estar bien.
   */
  const vigente = ENV.HEALTH_CONSENT_VERSION?.trim();
  if (!vigente) {
    anotar(
      'no hay versión de consentimiento de salud configurada',
      'sin HEALTH_CONSENT_VERSION el módulo de progreso queda inerte',
    );
  }

  let filas = null;
  try {
    const salida = execFileSync(
      'docker',
      [
        'exec',
        'gymlab-postgres',
        'psql',
        '-U',
        'gymlab',
        '-d',
        'gymlab',
        '-t',
        '-A',
        '-c',
        "select version || '|' || is_draft from consent_document_templates where purpose = 'health_data';",
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    filas = salida.trim().split('\n').filter(Boolean);
  } catch {
    anotar(
      'no se ha podido comprobar el consentimiento de salud',
      'hace falta la base de datos de desarrollo en marcha; no comprobado NO es aprobado',
    );
  }

  if (filas) {
    if (filas.length === 0) {
      anotar('no hay ninguna plantilla de consentimiento de salud', 'no habría nada que consentir');
    }

    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ SE PARTE POR EL SEPARADOR; NO SE MIRA COMO ACABA LA CADENA.      │
     * │                                                                  │
     * │ La primera version comparaba con «|t», dando por hecho que psql  │
     * │ imprime los booleanos como «t». Los imprime como «true», asi que │
     * │ el filtro no casaba NUNCA: el gate daba por bueno el             │
     * │ consentimiento sin haberlo mirado, y no se quejaba. Un guardian  │
     * │ que falla en silencio es peor que no tenerlo.                     │
     * │                                                                  │
     * │ Por eso ademas se comprueba que cada fila se ENTIENDE: si el     │
     * │ formato vuelve a cambiar, esto grita en vez de callarse.          │
     * └──────────────────────────────────────────────────────────────────┘
     */
    const ilegibles = [];
    const plantillas = [];
    for (const fila of filas) {
      const partes = fila.split('|');
      const marca = partes.at(-1)?.trim().toLowerCase();
      if (!['true', 't', 'false', 'f'].includes(marca ?? '')) {
        ilegibles.push(fila);
        continue;
      }
      plantillas.push({
        version: partes.slice(0, -1).join('|'),
        borrador: marca === 'true' || marca === 't',
      });
    }

    if (ilegibles.length > 0) {
      anotar(
        `no se entiende el estado de ${ilegibles.length} plantilla(s) de consentimiento`,
        `filas: ${ilegibles.join(' / ')} — arregla el gate antes de fiarte de él`,
      );
    }

    if (vigente) {
      const actual = plantillas.find((p) => p.version === vigente);
      if (!actual) {
        anotar(
          `la versión configurada (${vigente}) no existe como plantilla`,
          'HEALTH_CONSENT_VERSION apunta a un texto que no está sembrado',
        );
      } else if (actual.borrador) {
        anotar(
          `el consentimiento vigente sigue siendo un borrador: ${vigente}`,
          'en producción un borrador no ampara ningún dato de salud, y Progreso queda inerte',
        );
      }

      /*
       * Una plantilla de PRUEBA vigente es el fallo que mas caro sale: el texto
       * existe, no es borrador, y ampara datos de categoria especial diciendo
       * cualquier cosa. Se mira el nombre porque es lo unico que distingue a
       * una plantilla que nacio en un test.
       */
      if (/prueba|test|ejemplo|demo/i.test(vigente)) {
        anotar(
          `la versión vigente parece una plantilla de prueba: ${vigente}`,
          'un texto de prueba no puede amparar datos de salud en producción',
        );
      }
    }
  }
}

// ─── 5. Documentos de responsabilidad demostrada ─────────────────────────────
{
  const documentos = [
    ['politica-privacidad.md', 'la política que se publica'],
    ['aviso-legal.md', 'identificación del prestador'],
    ['acuerdo-encargo-art28.md', 'sin él no puede entrar ningún gimnasio real'],
    ['rat.md', 'registro de actividades de tratamiento (art. 30)'],
    ['eipd-salud.md', 'evaluación de impacto del módulo de salud (art. 35)'],
    ['proveedores-subencargados.md', 'quién trata qué y dónde'],
    ['politica-conservacion.md', 'los plazos, y quién los decide'],
  ];

  for (const [nombre, porque] of documentos) {
    const texto = leer(RAIZ, 'docs', 'legal', nombre);
    if (!texto) {
      anotar(`falta docs/legal/${nombre}`, porque);
      continue;
    }
    if (texto.trim().length < 500) {
      anotar(`docs/legal/${nombre} está prácticamente vacío`, 'existir no es lo mismo que decir algo');
    }
    /*
     * Los `[[PRESTADOR_*]]` de los modelos contractuales son deliberados: son
     * el hueco que se rellena al firmar, y NO cuentan como marcador olvidado.
     * Lo que no puede haber es un TODO.
     */
    /*
     * SIN la bandera `i`, y no es un descuido. Con ella, «método (efectivo…»
     * casaba: la tilde no es caracter de palabra en JavaScript, asi que hay
     * frontera entre «é» y «todo», y «Todo: identidad, credenciales…» tambien
     * saltaba. Un marcador de verdad se escribe en mayusculas; `@todo` va
     * aparte porque ahi si se escribe de las dos formas.
     */
    if (/\bTODO\s*[:(]|\bFIXME\b/.test(texto) || /@todo\b/i.test(texto)) {
      anotar(`docs/legal/${nombre} tiene un TODO`, 'un documento de responsabilidad no se entrega a medias');
    }
  }
}

// ─── 6. Que la política de conservación se EJECUTE ───────────────────────────
{
  const rls = leer(RAIZ, 'packages', 'db', 'sql', '01-rls.sql');
  const funciones = ['app_purge_access_data', 'app_purge_audit_log', 'app_purge_invitations', 'app_purge_health_data'];
  const ausentes = funciones.filter((f) => !rls?.includes(`FUNCTION ${f}(`));
  if (!rls) {
    anotar('falta packages/db/sql/01-rls.sql', 'es donde viven las políticas y las purgas');
  } else if (ausentes.length > 0) {
    anotar(
      `faltan purgas de retención: ${ausentes.join(', ')}`,
      'una política de conservación que nadie ejecuta es un párrafo, no una política',
    );
  }

  if (!leer(RAIZ, 'packages', 'db', 'src', 'retencion.ts')) {
    anotar('falta packages/db/src/retencion.ts', 'los plazos declarados, para poder contrastarlos');
  }
}

// ─── 7. Que el borrado de cuenta siga en pie ─────────────────────────────────
{
  const servicio = leer(RAIZ, 'apps', 'api', 'src', 'auth', 'account-erasure.service.ts');
  const controlador = leer(RAIZ, 'apps', 'api', 'src', 'auth', 'account-erasure.controller.ts');
  const reauth = leer(RAIZ, 'apps', 'api', 'src', 'auth', 'reautenticacion.ts');

  if (!servicio || !controlador) {
    anotar('falta el borrado de cuenta', 'las dos tiendas lo exigen desde dentro de la aplicación');
  } else if (!/@Delete\(\)/.test(controlador)) {
    anotar('el borrado de cuenta no expone DELETE', 'la ruta tiene que existir, no solo el servicio');
  }

  if (!reauth) {
    anotar('falta la reautenticación del borrado', 'escribir ELIMINAR es intención, no identidad');
  }
}

// ─── Veredicto ───────────────────────────────────────────────────────────────
if (pendientes.length === 0) {
  console.log('LISTO PARA TIENDAS: no queda ningún bloqueo jurídico.');
  process.exit(0);
}

console.error('NO LISTO PARA TIENDAS. Falta:\n');
for (const { que, porque } of pendientes) console.error(`  · ${que}\n      ${porque}\n`);
console.error(
  'Esto NO impide desarrollar ni fusionar: impide declararse listo para tienda.\n' +
    'La forma de ponerlo verde es resolver lo de arriba, no inventar valores.',
);
process.exit(1);
