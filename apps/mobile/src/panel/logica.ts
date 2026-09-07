import type { Member } from '@gymlab/contracts';

/**
 * Las decisiones del Panel, sin React y sin red.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL PANEL MOVIL RESPONDE PREGUNTAS. NO GESTIONA.                         │
 * │                                                                          │
 * │ Quien lo usa esta de pie, con una persona delante, y necesita saber      │
 * │ quien es y si esta al corriente. Dar de alta, cobrar o editar se hace    │
 * │ sentado y ya tiene sitio: el panel web. Por eso aqui no hay ni un solo   │
 * │ camino de escritura.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** El estado de una peticion. Mismo vocabulario que el resto de la app. */
export type EstadoDeCarga<T> =
  | { fase: 'cargando' }
  | { fase: 'ok'; datos: T }
  | { fase: 'fallo'; mensaje: string };

/**
 * A partir de cuantas letras se busca.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CON UNA LETRA LA BUSQUEDA NO SIRVE, Y ADEMAS ESTORBA.                   │
 * │                                                                          │
 * │ «a» devolveria medio gimnasio: una lista que no responde nada y que      │
 * │ ademas hay que traer entera por la red mientras alguien sigue            │
 * │ escribiendo. Con dos ya se distingue, y el numero de socio —que es lo    │
 * │ que se teclea cuando se sabe— casi siempre tiene dos digitos o mas.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const LETRAS_MINIMAS = 2;

/** Cuanto se espera a que dejen de teclear antes de preguntar al servidor. */
export const ESPERA_MS = 350;

export function debeBuscar(texto: string): boolean {
  return texto.trim().length >= LETRAS_MINIMAS;
}

/**
 * En que punto esta la busqueda. Lo que decide QUE se pinta.
 *
 * `escribiendo` y `vacio` son estados distintos a proposito: «no hay nadie con
 * ese nombre» solo se puede decir cuando el servidor ha contestado. Dicho antes
 * —mientras aun se teclea— seria mentira la mitad del tiempo.
 */
export type FaseDeBusqueda =
  /** Todavia no se ha escrito bastante. */
  | { tipo: 'esperando' }
  | { tipo: 'buscando' }
  | { tipo: 'sinResultados'; consulta: string }
  | { tipo: 'resultados'; socios: readonly Member[]; total: number }
  | { tipo: 'fallo'; mensaje: string };

/**
 * ¿Sigue interesando esta respuesta?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS RESPUESTAS NO LLEGAN EN ORDEN.                                      │
 * │                                                                          │
 * │ Al teclear «Fernández» se lanzan varias busquedas. Si la de «Fern» tarda │
 * │ mas que la de «Fernández» y se pinta al llegar, en la pantalla queda el  │
 * │ resultado de una consulta que ya no es la que hay escrita — y nadie      │
 * │ entiende por que.                                                        │
 * │                                                                          │
 * │ Vive aqui, y no dentro del componente, porque es la clase de fallo que   │
 * │ solo aparece con mala red y que nunca se reproduce a mano.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function siguePidiendose(consulta: string, ultimaLanzada: string): boolean {
  return consulta === ultimaLanzada;
}

/**
 * De lo que devuelve el servidor a lo que se pinta.
 *
 * Cero resultados NO es lo mismo que una lista: «no hay nadie con ese nombre»
 * es una respuesta, y merece decirse con esas palabras en lugar de dejar un
 * hueco en blanco que parece que la pantalla se ha roto.
 */
export function faseDeRespuesta(
  respuesta: { items: readonly Member[]; total: number },
  consulta: string,
): FaseDeBusqueda {
  if (respuesta.items.length === 0) return { tipo: 'sinResultados', consulta };
  return { tipo: 'resultados', socios: respuesta.items, total: respuesta.total };
}

/**
 * Como se resume un socio en una fila de resultados.
 *
 * El numero va SIEMPRE, aunque se haya buscado por nombre: es lo que permite
 * confirmar de un vistazo que se ha dado con la persona correcta cuando hay
 * dos que se llaman igual.
 */
export function lineaDeSocio(socio: Member): { titulo: string; detalle: string } {
  const nombre = `${socio.firstName} ${socio.lastName}`.trim();
  const partes = [`nº ${socio.memberNumber}`];
  if (socio.status !== 'active') partes.push('de baja');
  return { titulo: nombre, detalle: partes.join(' · ') };
}

/** El nombre completo, tal cual lo devuelve el contrato. */
export function nombreCompleto(socio: Member): string {
  return `${socio.firstName} ${socio.lastName}`.trim();
}

/**
 * Los datos de la ficha que SE PUEDEN enseñar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO LO QUE DEVUELVE EL ENDPOINT, Y SOLO SI TIENE VALOR.                │
 * │                                                                          │
 * │ `email`, `phone` y `birthDate` son opcionales en el contrato. Pintar     │
 * │ «Teléfono: —» en una ficha sin telefono no informa de nada y ensucia;    │
 * │ los huecos se quitan, no se rellenan.                                    │
 * │                                                                          │
 * │ Y NO se añade nada que el endpoint no traiga: ni notas internas, ni      │
 * │ historial, ni entrenador asignado. Cada uno de esos es otra peticion y   │
 * │ otra decision de privacidad.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface DatoDeFicha {
  etiqueta: string;
  valor: string;
}

export function datosDeLaFicha(
  socio: Member,
  formatearFecha: (iso: string) => string,
): readonly DatoDeFicha[] {
  const datos: DatoDeFicha[] = [{ etiqueta: 'Número de socio', valor: String(socio.memberNumber) }];
  if (socio.email) datos.push({ etiqueta: 'Correo', valor: socio.email });
  if (socio.phone) datos.push({ etiqueta: 'Teléfono', valor: socio.phone });
  if (socio.birthDate) {
    datos.push({ etiqueta: 'Fecha de nacimiento', valor: formatearFecha(socio.birthDate) });
  }
  datos.push({ etiqueta: 'Alta', valor: formatearFecha(socio.joinedAt) });
  if (socio.leftAt) datos.push({ etiqueta: 'Baja', valor: formatearFecha(socio.leftAt) });
  return datos;
}

/** Si el socio esta de baja, y por tanto la puerta no le va a dejar pasar. */
export function estaDeBaja(socio: Member): boolean {
  return socio.status !== 'active';
}
