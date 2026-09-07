import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { caminoDeInvitacion, tokenDelEnlace } from '../auth/recuperacion';
import { DOMINIO, RAIZ, RUTAS_DEL_CORREO, rutaDeEntrada } from './entrada';

/**
 * Que un enlace del correo acabe en RINDA y no en el navegador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ERA EL HUECO QUE QUEDO ABIERTO EN PARITY-0.                              │
 * │                                                                          │
 * │ Las pantallas de recuperar, restablecer e invitacion ya existian en el   │
 * │ movil, pero NO SE LLEGABA A ELLAS desde el flujo real: el correo lleva   │
 * │ una URL del panel web y el telefono la abria en Safari. Tener la         │
 * │ pantalla y no tener el camino es no tener la capacidad.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const enlace = (ruta: string) => `https://${DOMINIO}${ruta}`;

describe('los cinco casos que llegan por correo', () => {
  it('restablecer con token: la pantalla de la app, y el token intacto', () => {
    expect(rutaDeEntrada(enlace('/reset-password?token=abc123'))).toBe('/restablecer?token=abc123');
  });

  /*
   * El token viaja codificado —lo construye `encodeURIComponent` en la API— y
   * puede llevar `+`, `/` o `=`. Descodificarlo aqui lo romperia: `+` pasaria
   * a espacio en cuanto la ruta se volviera a leer.
   */
  it('un token con caracteres codificados llega tal cual', () => {
    const crudo = 'a%2Bb%2Fc%3D';
    expect(rutaDeEntrada(enlace(`/reset-password?token=${crudo}`))).toBe(
      `/restablecer?token=${crudo}`,
    );
  });

  it('restablecer SIN token: se abre igual, y la pantalla lo explica', () => {
    expect(rutaDeEntrada(enlace('/reset-password'))).toBe('/restablecer');
    // Se abre la app a proposito. Mandar estos enlaces al navegador seria
    // esconder el problema en otro sitio.
    expect(tokenDelEnlace(undefined)).toBeNull();
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL TOKEN EN BLANCO TIENE QUE LLEGAR A LA PANTALLA, NO MORIR AQUI.    │
   * │                                                                      │
   * │ `?token=%20%20` sale de un enlace que se partio al copiarlo. La      │
   * │ tentacion es filtrarlo en el `apple-app-site-association` —exigir    │
   * │ `?token=?*`— y que se abra en el navegador. Seria peor: la unica     │
   * │ pantalla que sabe decir «falta el enlace» es la de la app.           │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('restablecer con token en blanco: entra, y `tokenDelEnlace` lo iguala a nada', () => {
    expect(rutaDeEntrada(enlace('/reset-password?token=%20%20'))).toBe(
      '/restablecer?token=%20%20',
    );
    expect(tokenDelEnlace('  ')).toBeNull();
  });

  it('invitacion: la misma URL que usa el correo de invitaciones', () => {
    expect(rutaDeEntrada(enlace('/accept-invitation?token=inv-1'))).toBe('/invitacion?token=inv-1');
  });

  /*
   * Vincular no tiene URL propia, ni la tiene en el panel web: es la MISMA
   * invitacion abierta por alguien que ya tiene sesion. Quien decide es la
   * pantalla, con `caminoDeInvitacion`, no el enlace.
   */
  it('vincular invitacion: misma ruta, lo decide la sesion', () => {
    const destino = rutaDeEntrada(enlace('/accept-invitation?token=inv-1'));
    expect(destino).toBe('/invitacion?token=inv-1');
    expect(caminoDeInvitacion('inv-1', 'conSesion', 'crear')).toBe('vincular');
    expect(caminoDeInvitacion('inv-1', 'sinSesion', 'crear')).toBe('crear');
  });
});

describe('lo que NO se debe tocar', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ POR AQUI PASAN TODOS LOS ENLACES, NO SOLO LOS DE LOS CORREOS.        │
   * │                                                                      │
   * │ En desarrollo, el cliente de Expo arranca la app con una URL         │
   * │ `http://192.168.x.x:8081/…`. Reescribir cualquier cosa que empiece   │
   * │ por `http` dejaria la app sin poder abrirse desde el QR, y el fallo  │
   * │ solo aparecera en el telefono de alguien, no aqui.                   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('las URLs del cliente de desarrollo salen intactas', () => {
    for (const url of [
      'http://192.168.1.20:8081/',
      'exp://192.168.1.20:8081/--/restablecer',
      'exp+rinda://expo-development-client/?url=http%3A%2F%2F192.168.1.20%3A8081',
    ]) {
      expect(rutaDeEntrada(url), url).toBe(url);
    }
  });

  it('los enlaces con el esquema propio salen intactos', () => {
    expect(rutaDeEntrada('rinda:///perfil')).toBe('rinda:///perfil');
    expect(rutaDeEntrada('rinda://invitacion?token=x')).toBe('rinda://invitacion?token=x');
  });

  it('otro dominio no es asunto nuestro, aunque la ruta coincida', () => {
    const ajeno = 'https://ejemplo.com/reset-password?token=abc';
    expect(rutaDeEntrada(ajeno)).toBe(ajeno);
  });

  /*
   * Un dominio que TERMINA en el nuestro no es el nuestro. Sin comparar el
   * host entero, `gymlabfit.tech.ejemplo.com` colaria.
   */
  it('un dominio que solo se le parece tampoco', () => {
    for (const url of [
      `https://${DOMINIO}.ejemplo.com/reset-password?token=x`,
      `https://falso${DOMINIO}/reset-password?token=x`,
      // `www` no responde por HTTPS: no hay certificado, luego no puede haber
      // un enlace universal apuntando ahi.
      `https://www.${DOMINIO}/reset-password?token=x`,
    ]) {
      expect(rutaDeEntrada(url), url).toBe(url);
    }
  });

  it('por HTTP no, aunque sea nuestro dominio: los enlaces universales son HTTPS', () => {
    const url = `http://${DOMINIO}/reset-password?token=x`;
    expect(rutaDeEntrada(url)).toBe(url);
  });

  it('una ruta suelta es navegacion interna y se deja pasar', () => {
    expect(rutaDeEntrada('/restablecer?token=x')).toBe('/restablecer?token=x');
  });
});

describe('los bordes', () => {
  it('el nombre del dominio no distingue mayusculas', () => {
    expect(rutaDeEntrada(`https://GymLabFit.TECH/reset-password?token=x`)).toBe(
      '/restablecer?token=x',
    );
  });

  it('una barra final de mas no cambia el destino', () => {
    expect(rutaDeEntrada(enlace('/reset-password/?token=x'))).toBe('/restablecer?token=x');
  });

  /*
   * Del dominio, pero de una ruta del panel que en el movil no existe. Abrir
   * la app por su puerta es mejor que un «no encontrado»: el enlace ya se
   * abrio, y no navegar dejaria a quien lo pulso donde estaba, sin explicacion.
   */
  it('una ruta nuestra sin pantalla en el movil abre la app por su puerta', () => {
    expect(rutaDeEntrada(enlace('/socios'))).toBe(RAIZ);
    expect(rutaDeEntrada(enlace('/'))).toBe(RAIZ);
  });

  it('el fragmento se descarta: no lo usa ninguna pantalla', () => {
    expect(rutaDeEntrada(enlace('/reset-password?token=x#nada'))).toBe('/restablecer?token=x');
  });
});

/**
 * Las tres listas que tienen que decir lo mismo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SON TRES FICHEROS EN TRES SITIOS Y NINGUNO SE QUEJA SI SE SEPARAN.       │
 * │                                                                          │
 * │ El `apple-app-site-association` decide que rutas ENTREGA iOS. Los        │
 * │ `intentFilters` deciden que rutas entrega Android. `RUTAS_DEL_CORREO`    │
 * │ decide a que pantalla van. Si una lista se queda atras, el enlace acaba  │
 * │ en el navegador —o peor, entra y no hay pantalla— y no falla nada.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('iOS, Android y la app declaran las mismas rutas', () => {
  const RAIZ_REPO = join(__dirname, '..', '..', '..', '..');
  const APP = join(__dirname, '..', '..', 'app');

  const aasa = JSON.parse(
    readFileSync(
      join(RAIZ_REPO, 'apps', 'web', 'public', '.well-known', 'apple-app-site-association'),
      'utf8',
    ),
  ) as { applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] } };

  const config = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8')) as {
    expo: {
      ios: { bundleIdentifier: string; associatedDomains: string[] };
      android: {
        package: string;
        intentFilters: {
          action: string;
          autoVerify: boolean;
          category: string[];
          data: { scheme: string; host: string; path: string }[];
        }[];
      };
    };
  };

  const esperadas = Object.keys(RUTAS_DEL_CORREO);

  /** Que falte la lista entera tambien es un fallo, y con nombre. */
  function unico<T>(lista: T[], que: string): T {
    const valor = lista[0];
    if (valor === undefined) throw new Error(`no hay ${que}`);
    expect(lista, que).toHaveLength(1);
    return valor;
  }

  const detalle = () => unico(aasa.applinks.details, 'detalle en el fichero de Apple');
  const filtroAndroid = () => unico(config.expo.android.intentFilters, 'filtro de Android');

  it('iOS entrega exactamente las rutas que la app sabe abrir', () => {
    expect(detalle().components.map((c) => c['/'])).toEqual(esperadas);
  });

  it('Android entrega exactamente esas mismas', () => {
    const filtro = filtroAndroid();
    expect(filtro.data.map((d) => d.path)).toEqual(esperadas);
    // Todas del mismo dominio y por HTTPS.
    for (const d of filtro.data) {
      expect(d.host).toBe(DOMINIO);
      expect(d.scheme).toBe('https');
    }
  });

  /*
   * Sin `autoVerify`, Android enseña un dialogo de «con que app abro esto» en
   * vez de abrir RINDA. Con el, y sin `assetlinks.json` valido, el enlace se va
   * al navegador — que es el respaldo correcto mientras no exista la huella.
   */
  it('Android verifica el dominio, y el respaldo es la web', () => {
    const filtro = filtroAndroid();
    expect(filtro.autoVerify).toBe(true);
    expect(filtro.category).toEqual(['BROWSABLE', 'DEFAULT']);
  });

  it('el dominio asociado de iOS es el mismo, y solo ese', () => {
    expect(config.expo.ios.associatedDomains).toEqual([`applinks:${DOMINIO}`]);
  });

  it('el `appID` del fichero cuadra con el paquete que se compila', () => {
    expect(detalle().appIDs).toEqual([`956JGXGTKZ.${config.expo.ios.bundleIdentifier}`]);
    expect(config.expo.android.package).toBe(config.expo.ios.bundleIdentifier);
  });

  it('cada destino tiene pantalla de verdad', () => {
    for (const destino of Object.values(RUTAS_DEL_CORREO)) {
      expect(existsSync(join(APP, `${destino.slice(1)}.tsx`)), destino).toBe(true);
    }
  });

  /*
   * La cadena entera: sistema operativo -> `+native-intent` -> esta logica.
   * Las tres piezas pueden estar bien y no estar ATADAS, que es exactamente lo
   * que le paso a la lista del entrenador.
   */
  it('`+native-intent` esta puesto y delega aqui', () => {
    const codigo = readFileSync(join(APP, '+native-intent.ts'), 'utf8');
    expect(codigo).toMatch(/redirectSystemPath/);
    expect(codigo).toMatch(/rutaDeEntrada\(/);
  });
});
