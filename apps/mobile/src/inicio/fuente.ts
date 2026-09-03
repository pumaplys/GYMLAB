/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION NATIVA: NO HAY VISTA PREVIA. SON LAS LLAMADAS DE VERDAD.     │
 * │                                                                          │
 * │ Metro elige `fuente.web.ts` al compilar para web y ESTE fichero para iOS │
 * │ y Android. Ningun dato de muestra se empaqueta, y la pantalla no sabe    │
 * │ que existe una preview.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export {
  cargarEsencialesReal as cargarEsenciales,
  cargarProgresoReal as cargarProgreso,
  cargarRutinasReal as cargarRutinas,
} from './fuente-real';
