/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION NATIVA: NO HAY VISTA PREVIA. SON LAS LLAMADAS DE VERDAD.     │
 * │                                                                          │
 * │ Metro elige `fuente.web.ts` al compilar para web y ESTE fichero para iOS │
 * │ y Android. Aqui no hay ni condicion que evaluar: en un telefono el carne │
 * │ habla con la API y punto. Ningun dato de muestra —ni el token sintetico  │
 * │ de la preview— se empaqueta.                                            │
 * │                                                                          │
 * │ La pantalla llama a estas dos funciones y no sabe que existe una preview.│
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type { DatosDelCarne } from './fuente-real';
export { cargarCarneReal as cargarCarne, pedirCodigoReal as pedirCodigo } from './fuente-real';
