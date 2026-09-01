/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION NATIVA: VACIA, Y ESO ES TODO EL AISLAMIENTO.                  │
 * │                                                                          │
 * │ Metro elige `casos.web.ts` al compilar para web y ESTE fichero al        │
 * │ compilar para iOS y Android. Los nombres, correos y gimnasios de muestra  │
 * │ viven solo en el primero, asi que no existen dentro del binario: no es    │
 * │ que esten apagados, es que no se han empaquetado.                        │
 * │                                                                          │
 * │ Se comprueba buscando las cadenas dentro del .hbc exportado; si algun dia │
 * │ aparecen, es que alguien importo `casos.web` a mano.                     │
 * │                                                                          │
 * │ Con el mapa vacio, la ruta de vista previa no encuentra ningun caso y     │
 * │ redirige a la puerta. Ese es el segundo cerrojo; el primero es que la     │
 * │ variable de entorno tampoco existe en un build de tienda.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * NOTA sobre por que el aislamiento no esta en la RUTA:
 *
 * Se intento `app/vista-previa/[caso].web.tsx`, que es la extension de
 * plataforma documentada. No sirve: el `require.context` con el que
 * expo-router descubre las rutas incluye el fichero tambien en Android, y el
 * export falla al no poder resolver un import web. La extension de plataforma
 * SI funciona en un modulo normal como este, que no lo descubre un contexto.
 */
import type { Caso } from './tipos';

export const CASOS: Record<string, Caso> = {};
export type { Caso, Entrada, Pantalla } from './tipos';
