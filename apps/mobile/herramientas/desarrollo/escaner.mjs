import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EL ESCÁNER DE LA PUERTA, CONTRA LA CÁMARA DE VERDAD.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO LLAMA A `access/verify`. LLAMARLO SERIA HACER TRAMPA.            │
 * │                                                                          │
 * │ Lo unico que hace este fichero es COLGAR IMAGENES en la escena virtual   │
 * │ del emulador. Los pixeles entran por la camara, los decodifica           │
 * │ expo-camera dentro de la app, y la peticion la hace la app. Si el        │
 * │ escaner estuviera roto, aqui saldria rojo.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Siete comprobaciones, en este orden porque cada una deja el terreno puesto
 * para la siguiente:
 *
 *   1. sin permiso de camara se EXPLICA y se puede volver al Panel;
 *   2. concedido, la camara se enciende;
 *   3. un carne recien firmado -> PASA;
 *   4. el MISMO carne delante -> no se reenvia (la doble lectura);
 *   5. un QR que no es un carne -> ni siquiera sale de la app;
 *   6. un carne con firma falsa -> NO PASA por firma;
 *   7. un carne caducado -> NO PASA por caducidad.
 *
 *   node herramientas/desarrollo/escaner.mjs
 *
 * Requiere emulador con `-camera-back virtualscene`, API local en :3001,
 * `adb reverse tcp:3001` y Metro escuchando.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..', '..');
const RAIZ = resolve(MOVIL, '..', '..');
const FLUJOS = join(AQUI, 'flujos');
const TRABAJO = join(MOVIL, '.expo', 'escaner');
const CREDENCIALES = join(RAIZ, 'apps', 'web', 'auditoria', 'credenciales.local.json');
const ADB = 'C:/as/sdk/platform-tools/adb.exe';
const MAESTRO = 'C:/as/maestro/maestro/bin/maestro.bat';
const API = 'http://localhost:3001/v1';
/** Maestro es una JVM: sin esto no arranca. */
const JDK = 'C:/as/jdk/jdk-17.0.20.1+1';

const QRCode = createRequire(join(MOVIL, 'package.json'))('qrcode');

/** El cerrojo de siempre: esto no habla con produccion. */
function comprobarQueEsDesarrollo() {
  if (!API.startsWith('http://localhost:')) throw new Error(`API no local: ${API}`);
  const puentes = execFileSync(ADB, ['reverse', '--list'], { encoding: 'utf8' });
  if (!puentes.includes('tcp:3001')) {
    throw new Error('falta `adb reverse tcp:3001 tcp:3001`: la app no llegaria a la API local');
  }
}

const fixture = JSON.parse(readFileSync(CREDENCIALES, 'utf8'));
const recepcion = fixture.cuentas.receptionist;
/** Todo lo que se imprima pasa por aqui antes de llegar a la consola. */
const limpiar = (texto) => (texto ?? '').split(recepcion.clave).join('<clave oculta>');

const pasos = [];
function anotar(nombre, verde, nota = '') {
  pasos.push({ nombre, verde, nota });
  console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}${nota ? ` — ${nota}` : ''}`);
}

/**
 * Un argumento `-e` para Maestro, entrecomillado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN LAS COMILLAS, UN VALOR CON ESPACIOS SE PARTE EN DOS.                 │
 * │                                                                          │
 * │ Maestro es un `.bat`, asi que hay que lanzarlo por el interprete de      │
 * │ ordenes. `-e TITULO=NO PASA` llegaba como `-e TITULO=NO` y `PASA`, y     │
 * │ Maestro entendia `PASA` como un SEGUNDO flujo: «Flow path does not       │
 * │ exist: flujos\PASA». Con `JSON.stringify` va entero y ademas protege el │
 * │ `^` de los anclajes, que el interprete se comeria.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const argumento = (clave, valor) => JSON.stringify(`${clave}=${valor}`);

function unaVez(flujo, variables = {}) {
  const args = ['test', join(FLUJOS, flujo)];
  for (const [clave, valor] of Object.entries(variables)) args.push('-e', argumento(clave, valor));
  const r = spawnSync(MAESTRO, args, {
    cwd: FLUJOS,
    env: { ...process.env, JAVA_HOME: JDK },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  if (r.status !== 0) {
    console.log(limpiar(r.stdout).split('\n').slice(-30).join('\n'));
    if (r.stderr?.trim()) console.error(limpiar(r.stderr).split('\n').slice(-10).join('\n'));
  }
  return r.status === 0;
}

/**
 * El mismo flujo, con UN reintento.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNO, Y SOLO PORQUE EL ARRANQUE DEL EMULADOR NO ES DETERMINISTA.          │
 * │                                                                          │
 * │ Cada recorrido empieza borrando los datos de la app y vuelve a bajar      │
 * │ ~1800 modulos por el puente de adb; a veces la hoja del menu de           │
 * │ desarrollo llega tarde y tapa la pantalla de entrada. Eso es ruido del    │
 * │ banco de pruebas, no del producto.                                        │
 * │                                                                          │
 * │ UN reintento y se acabo: con dos o tres, un fallo de verdad —uno que      │
 * │ falla seis de cada diez veces— acabaria saliendo verde.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function maestro(...args) {
  if (unaVez(...args)) return true;
  console.log("  (el flujo fallo; se repite UNA vez por si fue el arranque)");
  return unaVez(...args);
}

/** Cuelga una imagen en las dos superficies de la escena virtual. */
function colgar(png) {
  for (const superficie of ['wall', 'table']) {
    execFileSync(ADB, ['emu', 'virtualscene-image', superficie, png], { stdio: 'pipe' });
  }
}

/**
 * Un carne de verdad, firmado por la API local.
 *
 * El token no vuelve de esta funcion ni se imprime: entra directo en el PNG.
 */
async function carneReal(nombre) {
  const png = join(TRABAJO, `${nombre}.png`);
  execFileSync(process.execPath, [join(AQUI, 'carne-de-prueba.mjs'), png], { stdio: 'pipe' });
  return png;
}

/** Un QR con un texto cualquiera, para lo que NO es un carne. */
async function qrDeTexto(nombre, texto) {
  const png = join(TRABAJO, `${nombre}.png`);
  await QRCode.toFile(png, texto, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 1400,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
  return png;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────

comprobarQueEsDesarrollo();
mkdirSync(TRABAJO, { recursive: true });

/*
 * El caducado se firma AL PRINCIPIO y se cuelga AL FINAL: el token vive 60 s y
 * hacen falta esos 60 s de reloj de verdad. Firmarlo aqui los aprovecha
 * mientras corren las demas comprobaciones, en vez de esperar de brazos
 * cruzados.
 */
const nacimientoDelCaducado = Date.now();
const pngCaducado = await carneReal('caducado');

console.log('\n=== ESCÁNER — permiso y cámara ===');
anotar(
  '1-2 permiso denegado, se explica y se puede salir; concedido, la cámara se enciende',
  maestro('escaner-permiso.yaml', { CORREO: recepcion.email, CLAVE: recepcion.clave }),
);

console.log('\n=== ESCÁNER — un carné bueno ===');
const pngBueno = await carneReal('bueno');
colgar(pngBueno);
anotar(
  '3 carné recién firmado: PASA',
  maestro('escaner-veredicto.yaml', {
    TITULO: '^PASA$',
    MOTIVO: 'Acceso correcto.',
    CAPTURA: 'escaner-03-pasa',
  }),
);

console.log('\n=== ESCÁNER — la doble lectura ===');
/*
 * El mismo carne sigue colgado. Al cerrar el veredicto la camara vuelve a
 * verlo decenas de veces por segundo, y NO se reenvia: `ultimoEnviado` se
 * conserva a proposito. Se comprueba por AUSENCIA — que no salga ningun
 * veredicto nuevo— porque eso es exactamente lo que tiene que pasar.
 */
if (maestro('escaner-otro.yaml')) {
  await esperar(8000);
  const salio = maestro('escaner-veredicto.yaml', {
    TITULO: 'PASA',
    MOTIVO: '.',
    CAPTURA: 'escaner-04-no-deberia-existir',
  });
  anotar(
    '4 el mismo carné delante 8 s: no se reenvía',
    !salio,
    salio ? 'salió un veredicto nuevo: la app está recontando entradas' : 'sin veredicto nuevo',
  );
} else {
  anotar('4 el mismo carné delante 8 s: no se reenvía', false, 'no se pudo cerrar el veredicto');
}

console.log('\n=== ESCÁNER — un QR que no es un carné ===');
colgar(await qrDeTexto('cartel', 'https://gymlabfit.tech/precios'));
await esperar(8000);
{
  const salio = maestro('escaner-veredicto.yaml', {
    TITULO: 'PASA',
    MOTIVO: '.',
    CAPTURA: 'escaner-05-no-deberia-existir',
  });
  anotar(
    '5 el cartel de la wifi no sale de la app',
    !salio,
    salio ? 'se mandó al servidor un QR que no era un carné' : 'ni veredicto ni petición',
  );
}

console.log('\n=== ESCÁNER — una firma falsa ===');
/*
 * 119 caracteres del alfabeto base64url: pasa el filtro del cliente —que es
 * de FORMA, no de firma— y tiene que morir en el servidor. Sin este caso, el
 * filtro podria estar tapando que la verificacion remota ni se ejerce.
 */
const falso = 'A'.repeat(60) + 'b'.repeat(59);
colgar(await qrDeTexto('falso', falso));
anotar(
  '6 firma falsa: NO PASA por firma',
  maestro('escaner-veredicto.yaml', {
    TITULO: 'NO PASA',
    MOTIVO: 'El código no es válido. No lo ha emitido este gimnasio.',
    CAPTURA: 'escaner-06-firma-falsa',
  }),
);

console.log('\n=== ESCÁNER — un carné caducado ===');
if (maestro('escaner-otro.yaml')) {
  const vivido = Date.now() - nacimientoDelCaducado;
  const falta = 65_000 - vivido;
  if (falta > 0) {
    console.log(`  (esperando ${(falta / 1000).toFixed(0)} s a que caduque de verdad)`);
    await esperar(falta);
  }
  colgar(pngCaducado);
  anotar(
    '7 carné caducado: NO PASA por caducidad',
    maestro('escaner-veredicto.yaml', {
      TITULO: 'NO PASA',
      MOTIVO: 'El código ha caducado. Pídele que lo genere otra vez.',
      CAPTURA: 'escaner-07-caducado',
    }),
  );
} else {
  anotar('7 carné caducado: NO PASA por caducidad', false, 'no se pudo cerrar el veredicto');
}

console.log('\n=== RESUMEN DEL ESCÁNER ===');
for (const { nombre, verde } of pasos) console.log(`  ${verde ? 'VERDE' : 'ROJO '}  ${nombre}`);
process.exit(pasos.every((p) => p.verde) ? 0 : 1);
