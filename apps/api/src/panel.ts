import express from 'express';
import type { Request, RequestHandler, Response } from 'express';
import { existsSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * El panel web, servido por la propia API y bajo el MISMO ORIGEN.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO ES EL REQUISITO DE SESION, CONVERTIDO EN ESTRUCTURA.                │
 * │                                                                          │
 * │ La cookie que sostiene la sesion es `SameSite=Lax`, y `Lax` no viaja en  │
 * │ un `fetch` hacia otro origen. Con el panel en un dominio y la API en     │
 * │ otro, el panel NO TIENE SESION — en ningun navegador, no solo en Safari. │
 * │                                                                          │
 * │ Mientras eso dependia de la configuracion del hosting era una linea que  │
 * │ alguien podia tocar dentro de seis meses sin saber que sostenia. Aqui no │
 * │ hay nada que configurar mal: mismo proceso, luego mismo origen.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE NO SE USA `@nestjs/serve-static`
 *
 * Porque el orden de los middlewares importa y ese modulo no lo deja elegir:
 * registra el suyo al inicializar, y la reescritura de abajo tiene que ir por
 * delante. Aqui las tres piezas se montan en el orden en que se leen.
 */
const RUTA_PANEL = process.env.WEB_DIST_PATH ?? join(process.cwd(), 'web');

/**
 * El nombre lo fija Apple, sin extension. Vive en `apps/web/public/.well-known/`
 * y la exportacion estatica lo copia a `out/`, que es lo que se sirve aqui
 * —comprobado construyendo el panel: aparece en `out/.well-known/` con los
 * mismos bytes—.
 */
export const APPLE_APP_SITE_ASSOCIATION = 'apple-app-site-association';

/**
 * `/.well-known`, y SOLO `/.well-known`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EXPRESS 5 DEVUELVE 404 PARA CUALQUIER FICHERO BAJO UN DIRECTORIO CON     │
 * │ PUNTO. MEDIDO, NO SUPUESTO.                                              │
 * │                                                                          │
 * │ La documentacion de Express 4 decia que con el valor por defecto «no se  │
 * │ ignoran los ficheros de un directorio que empieza por punto». En 5.2.1   │
 * │ eso ya no es cierto: `/.well-known/apple-app-site-association` responde  │
 * │ 404 con el montaje normal y 200 con `dotfiles: 'allow'`. Se comprobo con │
 * │ un Express pelado, las dos opciones seguidas.                            │
 * │                                                                          │
 * │ Era el fallo mudo perfecto: el fichero esta en `out/`, se ve bien en     │
 * │ disco, y iOS recibe un 404 sin que nada en el despliegue se queje. Los   │
 * │ enlaces seguirian abriendo el navegador, que es justo lo que parecia     │
 * │ normal antes de haber esto.                                              │
 * │                                                                          │
 * │ POR QUE UN MONTAJE APARTE Y NO `dotfiles: 'allow'` EN EL DE ABAJO:       │
 * │ porque eso abriria TODO el espacio de puntos de `out/`. Asi solo sale el │
 * │ directorio que existe para ser publico, y `.env` o `.git` —si alguna vez │
 * │ acabaran ahi por error— siguen dando 404. Tambien comprobado.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function servirWellKnown(): RequestHandler {
  return express.static(join(RUTA_PANEL, '.well-known'), {
    // No hay indice que listar: se pide un fichero concreto o no hay nada.
    index: false,
    setHeaders: (respuesta, ruta) => {
      // Que un despliegue se note. Apple y Google releen estos ficheros.
      respuesta.setHeader('Cache-Control', 'no-cache');

      /*
       * `apple-app-site-association` NO TIENE EXTENSION, porque asi lo exige
       * Apple, y `serve-static` deduce el tipo de la extension: sin ella no
       * pone `Content-Type` ninguno. Apple pide `application/json`, y ademas
       * Caddy manda `X-Content-Type-Options: nosniff`, asi que no hay
       * adivinanza del cliente que lo salve.
       *
       * Se pone aqui y no en Caddy a proposito: quien sirve el fichero es este
       * proceso, y asi la cabecera viaja con el codigo, no con el hosting.
       */
      if (ruta.endsWith(`${sep}${APPLE_APP_SITE_ASSOCIATION}`)) {
        respuesta.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
    },
  });
}

/**
 * En desarrollo el panel corre en su propio servidor (`next dev`, puerto 3000)
 * y `out/` no existe. Sin esta comprobacion, la API no arrancaria sin haber
 * construido antes el panel.
 */
export const hayPanel = (): boolean => existsSync(RUTA_PANEL);
export const rutaDelPanel = (): string => RUTA_PANEL;

/** Lo que NO es del panel: la API versionada y la sonda del orquestador. */
function esDeLaApi(peticion: Request): boolean {
  return peticion.path === '/health' || peticion.path.startsWith('/v1/');
}

/**
 * `/socios` -> `/socios.html`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO LO HACIA `extensions: ['html']` DE express.static. YA NO.           │
 * │                                                                          │
 * │ En Express 5, `serve-static` 2.x dejo de reenviar esa opcion: la palabra │
 * │ `extensions` no aparece ni una vez en su codigo. Se acepta sin quejarse  │
 * │ y no hace nada — comprobado con un Express pelado dentro de la imagen.   │
 * │                                                                          │
 * │ Y el modo de fallo era el peor posible: la exportacion genera            │
 * │ `socios.html`, no `socios/index.html`, asi que TODAS las pantallas       │
 * │ acababan cayendo en el `index.html` de respaldo. `/socios` respondia 200 │
 * │ con la portada, que redirige a `/socios`, y parecia correcto.            │
 * │ `/reset-password?token=...` habria perdido el token por el camino.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function reescribirAHtml(): RequestHandler {
  return (peticion, _respuesta, siguiente) => {
    if (peticion.method !== 'GET' && peticion.method !== 'HEAD') return siguiente();
    if (esDeLaApi(peticion)) return siguiente();
    if (peticion.path === '/' || extname(peticion.path) !== '') return siguiente();

    const candidato = resolve(RUTA_PANEL, `.${peticion.path}.html`);
    // Que la ruta resuelta siga DENTRO del panel: `peticion.path` viene del
    // navegador y `..` es legal en una URL. `serve-static` tambien lo comprueba,
    // pero aqui se toca el sistema de ficheros antes que el.
    if (!candidato.startsWith(RUTA_PANEL + sep)) return siguiente();
    if (!existsSync(candidato)) return siguiente();

    peticion.url = `${peticion.path}.html${peticion.url.slice(peticion.path.length)}`;
    siguiente();
  };
}

/**
 * Monta la reescritura y los ficheros. Va ANTES de `app.init()`, es decir,
 * antes del enrutador de NestJS.
 */
export function montarPanel(app: NestExpressApplication): void {
  if (!hayPanel()) return;

  // Antes de la reescritura: `apple-app-site-association` no tiene extension,
  // asi que caeria en el «/socios -> /socios.html» de abajo.
  app.use('/.well-known', servirWellKnown());
  app.use(reescribirAHtml());
  app.use(
    express.static(RUTA_PANEL, {
      // Sin respaldo a `index.html`: el panel NO es una SPA, cada pantalla
      // tiene su propio `.html`. Lo que no exista debe acabar en el 404 de
      // abajo, no en la portada.
      index: ['index.html'],
      setHeaders: (respuesta, ruta) => {
        // Los ficheros con huella en el nombre no cambian nunca: si cambia el
        // contenido, cambia el nombre. El HTML no se cachea, para que un
        // despliegue se vea al recargar.
        const conHuella = ruta.includes(`${sep}_next${sep}static${sep}`);
        respuesta.setHeader(
          'Cache-Control',
          conHuella ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
}

/**
 * El ultimo recurso, montado DESPUES de `app.init()`.
 *
 * Antes del enrutador se quedaria con la aplicacion entera; despues, solo ve
 * lo que no ha reclamado nadie. Se separa por tipo de cliente porque no son el
 * mismo publico: la app movil habla con `/v1` y espera JSON, no una pagina.
 */
export function montar404(app: NestExpressApplication): void {
  if (!hayPanel()) return;

  app.use((peticion: Request, respuesta: Response) => {
    if (esDeLaApi(peticion)) {
      respuesta.status(404).json({ statusCode: 404, message: 'Not Found' });
    } else {
      respuesta.status(404).sendFile(join(RUTA_PANEL, '404.html'));
    }
  });
}
