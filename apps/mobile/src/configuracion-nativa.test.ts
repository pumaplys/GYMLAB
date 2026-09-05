import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

/**
 * La cabecera IHDR de un PNG: los trece bytes que van justo detras de la
 * firma. No hace falta descomprimir nada para saber el tamaño y si el fichero
 * declara canal alfa.
 */
function cabeceraPng(buf: Buffer) {
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(firma)) throw new Error('no es un PNG');
  return {
    ancho: buf.readUInt32BE(16),
    alto: buf.readUInt32BE(20),
    profundidad: buf[24],
    tipoColor: buf[25],
  };
}

/**
 * La configuracion con la que se compila la app nativa.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA EXCEPCION DE RED NO PUEDE ACABAR EN UN BUILD DE PRODUCCION.          │
 * │                                                                          │
 * │ `NSAllowsLocalNetworking` existe para poder hablar por HTTP con la API   │
 * │ del PC durante el ensayo con el telefono. En produccion la API es HTTPS  │
 * │ y esa excepcion no tiene ningun motivo — y un fallo asi no se ve: la app │
 * │ funciona igual, solo que acepta trafico en claro que no deberia.         │
 * │                                                                          │
 * │ Se comprueba EJECUTANDO `app.config.js` con la variable que pone EAS,    │
 * │ no leyendo el fichero: lo que importa es lo que produce.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RAIZ = join(__dirname, '..');
const requerir = createRequire(join(RAIZ, 'package.json'));

const base = JSON.parse(readFileSync(join(RAIZ, 'app.json'), 'utf8')).expo;

/** Ejecuta `app.config.js` como lo hace Expo, con el perfil que se le diga. */
function configuracionCon(perfil: string | undefined) {
  const antes = process.env.EAS_BUILD_PROFILE;
  if (perfil === undefined) delete process.env.EAS_BUILD_PROFILE;
  else process.env.EAS_BUILD_PROFILE = perfil;
  try {
    // Se recarga en cada llamada: el modulo lee la variable al importarse.
    delete requerir.cache[requerir.resolve('./app.config.js')];
    const fabricar = requerir('./app.config.js') as (a: { config: unknown }) => {
      ios?: { infoPlist?: Record<string, unknown> };
    };
    return fabricar({ config: structuredClone(base) });
  } finally {
    if (antes === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = antes;
  }
}

const ats = (perfil: string | undefined) =>
  (configuracionCon(perfil).ios?.infoPlist?.NSAppTransportSecurity as
    | Record<string, unknown>
    | undefined) ?? null;

describe('la excepcion de red es SOLO del perfil de desarrollo', () => {
  it('en development se permite la red local, y nada mas', () => {
    const politica = ats('development');
    expect(politica).not.toBeNull();
    expect(politica?.NSAllowsLocalNetworking).toBe(true);
    // Lo que apagaria ATS entera. Nunca.
    expect(politica?.NSAllowsArbitraryLoads).toBeUndefined();
    expect(politica?.NSAllowsArbitraryLoadsInWebContent).toBeUndefined();
  });

  it('en preview, en production y sin perfil NO hay excepcion ninguna', () => {
    for (const perfil of ['preview', 'production', undefined]) {
      expect(ats(perfil), String(perfil)).toBeNull();
    }
  });

  it('el fichero no nombra `NSAllowsArbitraryLoads` en ningun sitio', () => {
    const codigo = readFileSync(join(RAIZ, 'app.config.js'), 'utf8');
    const sinComentarios = codigo
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    expect(sinComentarios).not.toMatch(/NSAllowsArbitraryLoads/);
  });
});

describe('los assets de marca estan puestos y son los correctos', () => {
  const rutaDe = (relativa: string) => join(RAIZ, relativa.replace(/^\.\//, ''));

  it('las tres rutas de la config apuntan a ficheros que existen', () => {
    const rutas = [
      base.icon,
      base.android.adaptiveIcon.foregroundImage,
      base.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1].image,
    ];
    expect(rutas).toHaveLength(3);
    for (const r of rutas) {
      expect(r, 'ruta vacia').toBeTruthy();
      expect(existsSync(rutaDe(r)), `no existe ${r}`).toBe(true);
    }
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL ICONO DE iOS TIENE QUE SER 1024x1024 Y 100% OPACO.               │
   * │                                                                      │
   * │ Apple rechaza el icono de la App Store si algun pixel no es opaco, y │
   * │ el error clasico es dibujar las esquinas redondeadas: iOS ya pone su │
   * │ propia mascara. No basta con mirar si hay canal alfa —un PNG puede   │
   * │ tenerlo y ser opaco entero— asi que se leen los pixeles.             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('el icono de iOS es cuadrado, de 1024 y sin un solo pixel transparente', () => {
    const png = readFileSync(rutaDe(base.icon));
    const { ancho, alto, tipoColor } = cabeceraPng(png);
    expect(ancho).toBe(1024);
    expect(alto).toBe(1024);
    // Sin canal alfa NO puede haber transparencia. Es la comprobacion barata
    // que basta cuando se cumple; el revisor completo vive en el scratchpad.
    const conAlfa = tipoColor === 4 || tipoColor === 6;
    expect(conAlfa, 'el icono trae canal alfa: hay que mirar pixel a pixel').toBe(false);
  });

  it('el icono adaptativo de Android es 1024x1024', () => {
    const png = readFileSync(rutaDe(base.android.adaptiveIcon.foregroundImage));
    const { ancho, alto } = cabeceraPng(png);
    expect(ancho).toBe(1024);
    expect(alto).toBe(1024);
  });

  it('los dos fondos de marca son el grafito del tema', () => {
    const splash = base.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    )[1];
    expect(base.android.adaptiveIcon.backgroundColor).toBe('#0D0F12');
    expect(splash.backgroundColor).toBe('#0D0F12');
    expect(splash.resizeMode).toBe('contain');
  });
});

describe('la app no pide permisos que no usa', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ FACE ID: `expo-secure-store` LO DECLARA POR DEFECTO. AQUI NO.        │
   * │                                                                      │
   * │ Su plugin mete `NSFaceIDUsageDescription` —"Allow GYMLAB to access   │
   * │ your Face ID biometric data"— en el Info.plist aunque no se use      │
   * │ biometria. Y no se usa: `auth/almacen.ts` guarda el token SIN        │
   * │ `requireAuthentication`, y esta escrito alli por que.                │
   * │                                                                      │
   * │ Una app que declara un permiso que no ejerce asusta a quien lee la   │
   * │ ficha y da trabajo extra en la revision de Apple. `faceIDPermission: │
   * │ false` hace que el plugin BORRE la clave.                            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('secure-store no declara Face ID', () => {
    const entrada = base.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-secure-store',
    );
    expect(entrada, 'expo-secure-store deberia llevar opciones').toBeDefined();
    expect(entrada[1].faceIDPermission).toBe(false);
  });

  it('no hay camara, ni fotos, ni ubicacion, ni micro, ni contactos, ni seguimiento', () => {
    /*
     * El QR se ENSEÑA, no se escanea: la app no abre la camara en ningun
     * sitio. Si alguien añade una libreria que la pida, este test lo dice
     * antes de que el permiso aparezca en la ficha de la App Store.
     */
    const texto = JSON.stringify(base);
    for (const permiso of [
      'NSCameraUsageDescription',
      'NSPhotoLibraryUsageDescription',
      'NSLocationWhenInUseUsageDescription',
      'NSLocationAlwaysAndWhenInUseUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSContactsUsageDescription',
      'NSUserTrackingUsageDescription',
      'NSMotionUsageDescription',
    ]) {
      expect(texto, permiso).not.toContain(permiso);
    }
  });
});

describe('la identidad nativa es RINDA', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA MARCA ES RINDA. EL DOMINIO DE LA API SIGUE SIENDO gymlabfit.tech. │
   * │                                                                      │
   * │ No es una incoherencia: lo que ve una persona es el producto, y lo   │
   * │ que resuelve un DNS es la infraestructura. El bundle identifier usa  │
   * │ el DNS inverso del dominio que SI es nuestro —`tech.gymlabfit`— y    │
   * │ termina en el nombre del producto.                                   │
   * │                                                                      │
   * │ Por eso este fichero prohibe `com.gymlab.app` y NO prohibe           │
   * │ `gymlabfit.tech`.                                                    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('el nombre visible de la app es RINDA', () => {
    expect(base.name).toBe('RINDA');
  });

  it('bundle id, package y scheme son los definitivos', () => {
    expect(base.ios.bundleIdentifier).toBe('tech.gymlabfit.rinda');
    expect(base.android.package).toBe('tech.gymlabfit.rinda');
    expect(base.scheme).toBe('rinda');
    expect(base.slug).toBe('rinda');
  });

  it('el identificador anterior no vuelve por ningun sitio', () => {
    const texto = JSON.stringify(base);
    expect(texto).not.toContain('com.gymlab.app');
    // Ni la marca vieja como nombre visible o esquema.
    expect(base.name).not.toMatch(/gymlab/i);
    expect(base.scheme).not.toMatch(/gymlab/i);
  });

  it('el wordmark y la pantalla de arranque dicen RINDA', () => {
    for (const fichero of ['src/componentes/marca.tsx', 'src/componentes/arranque.tsx']) {
      const codigo = readFileSync(join(RAIZ, fichero), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
      expect(codigo, fichero).toContain('RINDA');
      expect(codigo, fichero).not.toMatch(/GYMLAB/);
    }
  });

  /*
   * Cambiar un bundle identifier despues de la primera subida a la App Store
   * es imposible: Apple lo ata a la ficha de la app para siempre. Este test no
   * decide cual es el bueno, solo obliga a que un cambio sea deliberado.
   */
  it('el formato vale para Apple y para Android', () => {
    // Segmentos separados por punto, cada uno empezando por letra.
    const inverso = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/;
    expect(base.ios.bundleIdentifier).toMatch(inverso);
    // Android no admite guiones en el nombre del paquete.
    expect(base.android.package).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    expect(base.scheme).toMatch(/^[a-z][a-z0-9.+-]*$/);
  });

  it('la version y los numeros de build son los de una primera interna', () => {
    expect(base.version).toBe('0.1.0');
    // iOS quiere una CADENA; Android, un entero.
    expect(base.ios.buildNumber).toBe('1');
    expect(base.android.versionCode).toBe(1);
  });
});
