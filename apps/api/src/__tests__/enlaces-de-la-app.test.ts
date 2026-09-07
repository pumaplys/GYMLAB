/**
 * Los ficheros que convierten un enlace HTTPS en una apertura de RINDA.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO COMPRUEBA UNA PANTALLA: COMPRUEBA UNA CABECERA.                  │
 * │                                                                          │
 * │ Los correos de recuperacion e invitacion llevan URLs del panel web. Para │
 * │ que el telefono las abra en la app en vez de en el navegador, iOS pide   │
 * │ `/.well-known/apple-app-site-association` por HTTPS, sin redirecciones y │
 * │ servido como JSON.                                                       │
 * │                                                                          │
 * │ El fichero se llama asi, SIN extension, porque lo exige Apple — y        │
 * │ `serve-static` deduce el tipo de la extension. Sin este test, el dia que │
 * │ alguien tocara `panel.ts` los enlaces dejarian de abrir la app y no      │
 * │ fallaria nada: seguirian funcionando en el navegador. Un fallo mudo.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PUBLICO = resolve(process.cwd(), '..', 'web', 'public');
const AASA = '/.well-known/apple-app-site-association';

/** El identificador de la app en Apple: equipo + `bundleIdentifier`. */
const APP_ID = '956JGXGTKZ.tech.gymlabfit.rinda';

/**
 * Las rutas que DEBEN entrar en la app, y ninguna mas.
 *
 * Son exactamente las que la API pone en los correos (`auth.instance.ts` e
 * `invitations.service.ts`) y para las que existe una pantalla en el movil.
 * `/verify-email` no esta a proposito: no hay pantalla que lo atienda.
 */
const RUTAS = ['/reset-password', '/accept-invitation'];

describe('el fichero que declara los enlaces universales', () => {
  const contenido = readFileSync(join(PUBLICO, '.well-known', 'apple-app-site-association'), 'utf8');
  const json = JSON.parse(contenido) as {
    applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] };
  };

  /** Un solo detalle: una sola app. Que falte la lista tambien es un fallo. */
  const detalle = () => {
    const [primero, ...resto] = json.applinks.details;
    if (primero === undefined) throw new Error('el fichero no declara ninguna app');
    expect(resto, 'solo hay una app').toEqual([]);
    return primero;
  };

  it('declara la app real: equipo y paquete', () => {
    expect(detalle().appIDs).toEqual([APP_ID]);
  });

  /*
   * «No permitir `/*` sin necesidad»: cada ruta que se declara es una pantalla
   * del panel que deja de poder abrirse en el navegador desde el telefono.
   */
  it('declara SOLO las rutas que tienen pantalla en el movil', () => {
    expect(detalle().components.map((c) => c['/'])).toEqual(RUTAS);
  });

  it('no hay comodines', () => {
    expect(contenido).not.toContain('*');
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA OTRA PUNTA DE LA CADENA: LO QUE LA API ESCRIBE EN EL CORREO.      │
   * │                                                                      │
   * │ Declarar `/reset-password` no sirve de nada si manana alguien cambia │
   * │ la URL del correo a `/recuperar-clave`. El enlace se abriria en el   │
   * │ navegador, la web seguiria funcionando, y nadie se enteraria de que  │
   * │ el movil ha dejado de recibirlos.                                    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('son las rutas que la API pone de verdad en los correos', () => {
    const auth = readFileSync(resolve(process.cwd(), 'src', 'auth', 'auth.instance.ts'), 'utf8');
    const invitaciones = readFileSync(
      resolve(process.cwd(), 'src', 'invitations', 'invitations.service.ts'),
      'utf8',
    );
    expect(auth).toContain('${env.WEB_APP_URL}/reset-password?token=');
    expect(invitaciones).toContain('${env.WEB_APP_URL}/accept-invitation?token=');
  });

  /*
   * `/verify-email` NO entra, y no es un olvido: `requireEmailVerification`
   * esta en `false`, no hay pantalla en el movil, y tampoco existe la ruta en
   * el panel web. Declararla mandaria a la app un enlace que nadie atiende.
   */
  it('`/verify-email` se queda fuera a proposito', () => {
    expect(RUTAS).not.toContain('/verify-email');
    expect(existsSync(resolve(process.cwd(), '..', 'web', 'src', 'app', 'verify-email'))).toBe(
      false,
    );
  });
});

/**
 * Contra el codigo que sirve el panel en produccion, no contra una imitacion.
 *
 * `WEB_DIST_PATH` tiene que estar puesta ANTES de importar `panel.ts`, porque
 * la ruta se resuelve al cargar el modulo. De ahi el `import()` diferido.
 */
describe('como lo sirve la API', () => {
  let app: express.Express;
  let carpeta: string;

  beforeAll(async () => {
    /*
     * Se copia `apps/web/public` a un directorio temporal porque eso es
     * EXACTAMENTE lo que hace la exportacion estatica de Next: comprobado
     * construyendo el panel, el fichero aparece en `out/.well-known/` con los
     * mismos bytes. No se usa `out/` directamente porque los tests de la API
     * no dependen de que el panel este construido.
     */
    carpeta = mkdtempSync(join(tmpdir(), 'panel-'));
    cpSync(PUBLICO, carpeta, { recursive: true });
    process.env.WEB_DIST_PATH = carpeta;

    const { montarPanel } = await import('../panel.js');
    app = express();
    montarPanel({ use: (...args: unknown[]) => app.use(...(args as [express.RequestHandler])) } as never);
  });

  afterAll(() => {
    delete process.env.WEB_DIST_PATH;
    if (carpeta && existsSync(carpeta)) rmSync(carpeta, { recursive: true, force: true });
  });

  it('responde 200 y como JSON, pese a no tener extension', async () => {
    const r = await request(app).get(AASA);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
  });

  it('sin redirecciones: Apple no las sigue', async () => {
    const r = await request(app).get(AASA).redirects(0);
    expect(r.status).toBe(200);
    expect(r.headers.location).toBeUndefined();
  });

  it('el cuerpo es el fichero, byte a byte', async () => {
    const r = await request(app).get(AASA);
    const original = readFileSync(join(PUBLICO, '.well-known', 'apple-app-site-association'));
    expect(Buffer.from(r.text)).toEqual(original);
  });

  /*
   * La reescritura `/socios` -> `/socios.html` mira todas las rutas sin
   * extension, y esta es una de ellas. Si algun dia se le escapara el fichero,
   * el 404 llegaria disfrazado de pagina.
   */
  it('la reescritura a `.html` no se lo lleva por delante', async () => {
    const r = await request(app).get(AASA);
    expect(r.headers['content-type']).not.toMatch(/html/);
  });

  it('y el panel se sigue sirviendo igual', async () => {
    const r = await request(app).get('/rinda-icono.png');
    expect(r.status).toBe(200);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL CONTROL NEGATIVO DE ABRIR EL ESPACIO DE PUNTOS.                   │
   * │                                                                      │
   * │ Para que `/.well-known/…` salga hubo que montarlo aparte, porque     │
   * │ Express 5 devuelve 404 bajo cualquier directorio con punto. La forma │
   * │ rapida —`dotfiles: 'allow'` en el montaje general— habria abierto de │
   * │ paso todo lo demas. Estos dos ficheros no existen en `out/`, pero    │
   * │ este test es lo que impide que alguien vuelva a la forma rapida.     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('el resto de ficheros con punto siguen cerrados', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    writeFileSync(join(carpeta, '.env'), 'SECRETO=no');
    mkdirSync(join(carpeta, '.git'), { recursive: true });
    writeFileSync(join(carpeta, '.git', 'config'), 'nada');

    expect((await request(app).get('/.env')).status).toBe(404);
    expect((await request(app).get('/.git/config')).status).toBe(404);
  });

  it('y dentro de `.well-known` lo que no existe da 404, no un HTML', async () => {
    const r = await request(app).get('/.well-known/no-existe');
    expect(r.status).toBe(404);
  });
});

/**
 * ANDROID: todavia NO se puede cerrar, y el test lo deja dicho.
 *
 * `assetlinks.json` necesita la huella SHA-256 de la firma que use la app. No
 * hay ninguna: nunca se ha construido para Android, asi que ni EAS tiene
 * almacen de claves ni existe Play Console. Inventar una huella dejaria un
 * fichero que parece hecho y que no verifica nada.
 *
 * Este test no exige que el fichero exista. Exige que, EL DIA QUE APAREZCA,
 * sea de verdad: paquete correcto y huellas con forma de SHA-256.
 */
describe('assetlinks.json, cuando exista', () => {
  const ruta = join(PUBLICO, '.well-known', 'assetlinks.json');

  it('todavia no existe, y es deliberado', () => {
    if (existsSync(ruta)) {
      const declaraciones = JSON.parse(readFileSync(ruta, 'utf8')) as {
        relation: string[];
        target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
      }[];
      expect(declaraciones.length).toBeGreaterThan(0);
      for (const d of declaraciones) {
        expect(d.target.package_name).toBe('tech.gymlabfit.rinda');
        expect(d.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
        for (const huella of d.target.sha256_cert_fingerprints) {
          // 32 bytes en hexadecimal separados por dos puntos. Un hueco sin
          // rellenar —«AA:BB:...», «TODO»— no pasa de aqui.
          expect(huella).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
        }
      }
    } else {
      expect(existsSync(ruta)).toBe(false);
    }
  });
});
