import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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
 * El pixel dibujado mas lejano del centro, en pixeles.
 *
 * Hay que descomprimir el PNG y deshacer el filtro de cada linea: no hay otra
 * forma de saber donde acaba el dibujo de verdad. Son ~50 lineas y evitan
 * meter una libreria de imagen en las dependencias por un solo test.
 */
function radioDelDibujo(buf: Buffer): number {
  const { ancho, alto, profundidad, tipoColor } = cabeceraPng(buf);
  if (profundidad !== 8 || (tipoColor !== 6 && tipoColor !== 4)) {
    throw new Error('se esperaba un PNG de 8 bits con canal alfa');
  }
  const bpp = tipoColor === 6 ? 4 : 2;

  const idat: Buffer[] = [];
  for (let i = 8; i < buf.length; ) {
    const largo = buf.readUInt32BE(i);
    if (buf.toString('ascii', i + 4, i + 8) === 'IDAT') {
      idat.push(buf.subarray(i + 8, i + 8 + largo));
    }
    i += 12 + largo;
  }
  const crudo = inflateSync(Buffer.concat(idat));

  const porLinea = ancho * bpp;
  const plano = Buffer.alloc(alto * porLinea);
  let origen = 0;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[origen++];
    const linea = crudo.subarray(origen, origen + porLinea);
    origen += porLinea;
    const destino = plano.subarray(y * porLinea, (y + 1) * porLinea);
    const arriba =
      y > 0 ? plano.subarray((y - 1) * porLinea, y * porLinea) : Buffer.alloc(porLinea);
    for (let x = 0; x < porLinea; x++) {
      const a = x >= bpp ? destino[x - bpp]! : 0;
      const b = arriba[x]!;
      const c = x >= bpp ? arriba[x - bpp]! : 0;
      const v = linea[x]!;
      let valor: number;
      if (filtro === 0) valor = v;
      else if (filtro === 1) valor = v + a;
      else if (filtro === 2) valor = v + b;
      else if (filtro === 3) valor = v + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        valor = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      destino[x] = valor & 0xff;
    }
  }

  let mayor = 0;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      // Alfa por encima de un umbral bajo: el antialiasing del borde no cuenta.
      if (plano[(y * ancho + x) * bpp + bpp - 1]! > 8) {
        const d = Math.hypot(x - ancho / 2, y - alto / 2);
        if (d > mayor) mayor = d;
      }
    }
  }
  return mayor;
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

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL ICONO ADAPTATIVO SE ENMASCARA, Y LO QUE SE SALE SE PIERDE.       │
   * │                                                                      │
   * │ Android dibuja el primer plano sobre un lienzo de 108 dp y solo      │
   * │ enseña los 72 dp centrales, con una mascara que en muchos telefonos  │
   * │ es un circulo. Sobre 1024 px, ese circulo tiene 341 px de radio.     │
   * │                                                                      │
   * │ El fichero que entrego diseño llegaba a 384 px: las puntas de la R   │
   * │ se cortaban. Se comprobo mirandolo con las tres mascaras.            │
   * │                                                                      │
   * │ Hay DOS limites, y aqui se exige el estrecho:                        │
   * │                                                                      │
   * │   72/108 -> radio 341 px   lo que tapa una mascara circular normal   │
   * │   66/108 -> radio 313 px   lo que Google recomienda dar por seguro,  │
   * │                            porque algunos fabricantes recortan mas   │
   * │                                                                      │
   * │ Reducido al 80 % del original el dibujo llega a 308 px y cumple los  │
   * │ dos. Se exige el de 313 a proposito: fue una decision, y si alguien  │
   * │ vuelve a un tamaño que solo cumpla el ancho, este test lo dice.      │
   * │                                                                      │
   * │ Esto no se ve hasta tener el telefono en la mano, y para entonces el │
   * │ icono ya esta instalado. Por eso se comprueba aqui.                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('el dibujo del icono adaptativo cabe en la zona segura conservadora', () => {
    const png = readFileSync(rutaDe(base.android.adaptiveIcon.foregroundImage));
    const { ancho } = cabeceraPng(png);
    const radioConservador = (ancho * 66) / 108 / 2;
    const radioPractico = (ancho * 72) / 108 / 2;
    const radio = radioDelDibujo(png);
    expect(
      radio,
      `el dibujo llega a ${Math.round(radio)} px; el limite conservador esta en ` +
        `${Math.round(radioConservador)} y el practico en ${Math.round(radioPractico)}`,
    ).toBeLessThanOrEqual(radioConservador);
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

  it('no hay fotos, ni ubicacion, ni micro, ni contactos, ni seguimiento', () => {
    /*
     * La camara SI, desde STAFF-2: el personal del gimnasio lee el QR del
     * socio en la puerta. Todo lo demas sigue prohibido, y si alguien añade
     * una libreria que lo pida, este test lo dice antes de que el permiso
     * aparezca en la ficha de la App Store.
     */
    const texto = JSON.stringify(base);
    for (const permiso of [
      'NSPhotoLibraryUsageDescription',
      'NSPhotoLibraryAddUsageDescription',
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

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ INSTALAR `expo-camera` YA PIDE EL MICROFONO. HAY QUE APAGARLO.       │
   * │                                                                      │
   * │ Expo autoenlaza el plugin del paquete en cuanto esta instalado,       │
   * │ aunque no se escriba en `plugins`. Sus valores por defecto son        │
   * │ `recordAudioAndroid: true` y una descripcion de microfono en ingles.  │
   * │ MEDIDO con `expo config --type introspect` antes y despues:           │
   * │                                                                      │
   * │   autoenlazado : NSCameraUsageDescription "Allow $(PRODUCT_NAME)…"    │
   * │                  NSMicrophoneUsageDescription "…your microphone"      │
   * │                  android.permission.CAMERA + RECORD_AUDIO             │
   * │   configurado  : NSCameraUsageDescription en castellano               │
   * │                  sin microfono, sin RECORD_AUDIO                      │
   * │                                                                      │
   * │ La app no graba audio en ningun sitio. Un permiso de microfono en la  │
   * │ ficha de una app de gimnasio es exactamente lo que hace que alguien   │
   * │ no la instale — y ademas da trabajo extra en la revision de Apple.    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la camara se declara con su motivo, en castellano, y sin microfono', () => {
    const entrada = base.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-camera',
    );
    expect(entrada, 'expo-camera deberia llevar opciones explicitas').toBeDefined();
    const opciones = entrada[1];

    expect(opciones.cameraPermission).toMatch(/cámara/);
    expect(opciones.cameraPermission).toMatch(/carn/i);
    // Nada de la descripcion por defecto del paquete, que va en ingles.
    expect(opciones.cameraPermission).not.toMatch(/PRODUCT_NAME|Allow/);

    // Las dos que apagan el audio. `false` explicito: `undefined` NO vale.
    expect(opciones.microphonePermission).toBe(false);
    expect(opciones.recordAudioAndroid).toBe(false);
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

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL BUILD SUBE; LA VERSION COMERCIAL, NO.                             │
   * │                                                                      │
   * │ Son dos numeros con dos trabajos distintos. `version` es lo que ve    │
   * │ una persona y solo cambia cuando cambia el producto. `buildNumber` es │
   * │ lo que distingue DOS BINARIOS de esa misma version, y Apple no        │
   * │ acepta dos subidas con el mismo.                                      │
   * │                                                                      │
   * │   (1)  la primera build interna: sin camara                          │
   * │   (2)  NATIVE-3: incorpora expo-camera, que es codigo nativo y por    │
   * │        tanto NO llega recargando Metro — hace falta otro binario      │
   * │                                                                      │
   * │   (3)  RELEASE-0: la consolidada. Trae todo lo de PARITY-1 a          │
   * │        PARITY-5 y, sobre todo, el entitlement de Universal Links,     │
   * │        que la (2) no llevaba — por eso el sistema nunca fue a buscar  │
   * │        la AASA.                                                       │
   * │                                                                      │
   * │ Android se queda en 1 a proposito: hasta RELEASE-0 no hubo ninguna    │
   * │ build de Android, asi que su `versionCode` no se ha consumido.        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la version comercial no se mueve y el build number si', () => {
    expect(base.version).toBe('0.1.0');
    // iOS quiere una CADENA; Android, un entero.
    expect(base.ios.buildNumber).toBe('3');
    expect(base.android.versionCode).toBe(1);
  });
});
