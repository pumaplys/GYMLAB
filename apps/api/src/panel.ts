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
