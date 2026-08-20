/**
 * Cliente minimo del protocolo de Chrome (CDP), sin dependencias.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE NO PUPPETEER NI PLAYWRIGHT.                                      │
 * │                                                                          │
 * │ Lo que D0 necesita del navegador cabe en cinco ordenes: abrir pestana,   │
 * │ fijar el tamano del viewport, navegar, ejecutar javascript y leer lo que │
 * │ devuelve. Nada de selectores, esperas inteligentes, reintentos ni        │
 * │ trazas — para eso estan los frameworks, y por eso pesan.                 │
 * │                                                                          │
 * │ Node 24 trae `WebSocket` en el propio runtime, y CDP es un WebSocket.    │
 * │ Asi que el coste de hacerlo a mano es este fichero, y el de no hacerlo   │
 * │ eran seis paquetes mas en el arbol.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Usa un Chrome que ya este en la maquina. No descarga ninguno.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Donde suele estar Chrome.
 *
 * El orden importa: primero lo que diga quien ejecuta, luego Chrome, luego
 * Chromium, y Edge al final —es Chromium por dentro y sirve, pero solo si no
 * hay nada mejor—.
 */
const CANDIDATOS = [
  process.env.D0_CHROME,
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

export function buscarChrome() {
  for (const ruta of CANDIDATOS) {
    if (ruta && existsSync(ruta)) return ruta;
  }
  throw new Error(
    'No se encontro Chrome ni Chromium. Indica la ruta con D0_CHROME=/ruta/a/chrome.',
  );
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Arranca Chrome sin ventana y se conecta.
 *
 * El puerto 0 deja que el sistema elija uno libre: dos auditorias a la vez no
 * se pisan, y en CI no hay que reservar nada.
 */
export async function abrirNavegador() {
  const binario = buscarChrome();
  const perfil = mkdtempSync(join(tmpdir(), 'gymlab-d0-'));

  const proceso = spawn(
    binario,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      // En contenedores sin espacio compartido, Chrome se cae sin esto.
      '--disable-dev-shm-usage',
      // CI corre como root en el contenedor de GitHub.
      ...(process.env.CI ? ['--no-sandbox'] : []),
      `--user-data-dir=${perfil}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  // El puerto elegido lo escribe Chrome en su stderr al arrancar.
  const puerto = await new Promise((resolve, reject) => {
    let salida = '';
    const alTiempo = setTimeout(
      () => reject(new Error('Chrome no anuncio su puerto en 20 s.\n' + salida)),
      20_000,
    );
    proceso.stderr.on('data', (trozo) => {
      salida += trozo;
      const m = salida.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        clearTimeout(alTiempo);
        resolve(Number(m[1]));
      }
    });
    proceso.on('exit', (codigo) => {
      clearTimeout(alTiempo);
      reject(new Error(`Chrome termino antes de arrancar (codigo ${codigo}).\n` + salida));
    });
  });

  let version;
  for (let i = 0; i < 40; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${puerto}/json/version`)).json();
      break;
    } catch {
      await dormir(250);
    }
  }
  if (!version) throw new Error('Chrome arranco pero no responde en su puerto.');

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('No se pudo abrir el WebSocket de CDP.'));
  });

  let siguienteId = 0;
  const pendientes = new Map();
  ws.onmessage = (evento) => {
    const mensaje = JSON.parse(evento.data);
    if (mensaje.id && pendientes.has(mensaje.id)) {
      pendientes.get(mensaje.id)(mensaje);
      pendientes.delete(mensaje.id);
    }
  };

  const enviar = (metodo, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++siguienteId;
      const alTiempo = setTimeout(() => {
        pendientes.delete(id);
        reject(new Error(`CDP sin respuesta: ${metodo}`));
      }, 30_000);
      pendientes.set(id, (mensaje) => {
        clearTimeout(alTiempo);
        if (mensaje.error) reject(new Error(`${metodo}: ${mensaje.error.message}`));
        else resolve(mensaje.result);
      });
      ws.send(JSON.stringify({ id, method: metodo, params, sessionId }));
    });

  return {
    navegador: version.Browser,
    binario,

    /**
     * Una pestana nueva, ya adjunta.
     *
     * Con `contextoAislado`, la pestana vive en su propio contexto de
     * navegador: cookies separadas. Es lo que permite auditar los cuatro
     * anchos A LA VEZ —cada uno entrando con su rol— sin que la sesion de una
     * pestana pise la de las otras, que es justo lo que pasaria compartiendo
     * el perfil.
     */
    async pestana({ contextoAislado = false } = {}) {
      let browserContextId;
      if (contextoAislado) {
        ({ browserContextId } = await enviar('Target.createBrowserContext', {}));
      }
      const { targetId } = await enviar('Target.createTarget', {
        url: 'about:blank',
        ...(browserContextId ? { browserContextId } : {}),
      });
      const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true });
      await enviar('Page.enable', {}, sessionId);
      await enviar('Runtime.enable', {}, sessionId);

      return {
        /**
         * Fija el viewport. `movil` activa el modo tactil, que es lo que hace
         * que `pointer: coarse` responda como en un telefono de verdad.
         */
        async viewport(ancho, alto, movil) {
          await enviar(
            'Emulation.setDeviceMetricsOverride',
            { width: ancho, height: alto, deviceScaleFactor: 1, mobile: movil },
            sessionId,
          );
          // `maxTouchPoints` tiene que ser >= 1 aunque se este desactivando:
          // CDP rechaza el cero incluso con `enabled: false`.
          await enviar(
            'Emulation.setTouchEmulationEnabled',
            { enabled: movil, maxTouchPoints: movil ? 5 : 1 },
            sessionId,
          );
        },

        async ir(url) {
          await enviar('Page.navigate', { url }, sessionId);
          // La aplicacion se pinta en el cliente: esperar al evento de carga no
          // basta, hay que darle su turno a React. Quien decide de verdad
          // cuando esta lista es `esperarA`; esto solo evita el primer sondeo
          // contra una pagina todavia en blanco.
          await dormir(120);
        },

        /** Ejecuta javascript en la pagina y devuelve el valor ya serializado. */
        async evaluar(expresion) {
          const r = await enviar(
            'Runtime.evaluate',
            { expression: expresion, returnByValue: true, awaitPromise: true },
            sessionId,
          );
          if (r.exceptionDetails) {
            throw new Error(
              'La sonda fallo en la pagina: ' +
                (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text),
            );
          }
          return r.result?.value;
        },

        /** Reintenta una condicion hasta que se cumple o se agota el tiempo. */
        async esperarA(expresion, ms = 8000) {
          const limite = Date.now() + ms;
          while (Date.now() < limite) {
            if (await this.evaluar(expresion)) return true;
            await dormir(150);
          }
          return false;
        },

        /**
         * Espera a que la pagina deje de CRECER.
         *
         * Que esten las acciones no significa que este la lista: en
         * `/entrenador/ejercicios` el boton "Nuevo ejercicio" aparece al
         * instante y los 74 ejercicios tardan. Se midio esa pantalla en 812 px
         * de alto —exactamente el viewport— cuando de verdad mide 9.159.
         *
         * Y `scrollAlto` no es un dato de adorno: es el criterio de salida de
         * D6 para la ficha del socio y el editor de rutinas. Un numero que
         * depende de cuando miraste no sirve para eso.
         *
         * Dos lecturas iguales seguidas bastan; no hace falta saber que se
         * estaba cargando.
         */
        async esperarEstable(ms = 6000) {
          const limite = Date.now() + ms;
          let previo = -1;
          while (Date.now() < limite) {
            const alto = await this.evaluar('document.documentElement.scrollHeight');
            if (alto === previo && alto > 0) return true;
            previo = alto;
            await dormir(250);
          }
          return false;
        },

        async cerrar() {
          await enviar('Target.closeTarget', { targetId });
          if (browserContextId) {
            await enviar('Target.disposeBrowserContext', { browserContextId });
          }
        },
      };
    },

    async cerrar() {
      try {
        ws.close();
      } catch {
        /* da igual: el proceso se mata igualmente */
      }
      proceso.kill();
      try {
        rmSync(perfil, { recursive: true, force: true });
      } catch {
        /* el perfil temporal lo limpia el sistema si aqui falla */
      }
    },
  };
}
