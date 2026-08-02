/**
 * Punto de extension para la exportacion de datos personales (ADR-0011).
 *
 * Los articulos 15 y 20 del RGPD obligan a entregar **todo** lo que se guarda de
 * una persona. Ese "todo" vive repartido entre modulos, y `members` no puede ir a
 * buscarlo: `billing` ya depende de `members` para validar que el socio existe,
 * asi que la llamada de vuelta cerraria un ciclo — el mismo que dejo a Nest
 * colgado en el arranque sin ningun error (ADR-0010).
 *
 * Aqui `members` pregunta a una lista y compone. No sabe quien hay dentro.
 *
 * POR QUE EL BORRADO NO NECESITA ESTO: el articulo 17 ya lo resuelven las claves
 * ajenas. PostgreSQL propaga un borrado solo, pero no sabe componer una lectura.
 */

/**
 * REGLA PARA QUIEN IMPLEMENTE ESTA INTERFAZ, y cuesta caro descubrirla sola:
 *
 * el implementador NO puede depender de `MembersService`, ni directa ni
 * indirectamente. Este token esta en su grafo de dependencias, asi que lo que se
 * registre arrastra consigo todo lo que necesite. Cerrar el circulo deja a Nest
 * esperando para siempre en el arranque, SIN ningun error.
 *
 * Por eso los implementadores son clases dedicadas que leen sus propias tablas
 * con la transaccion de la peticion, y no los servicios de cada modulo.
 */
export const PERSONAL_DATA_CONTRIBUTORS = Symbol('PERSONAL_DATA_CONTRIBUTORS');

export interface PersonalDataContributor {
  /** Etiqueta con la que aparece en la exportacion entregada. */
  readonly seccion: string;
  /**
   * Todo lo que este modulo guarda de ese socio.
   *
   * Devolver una lista vacia es correcto y frecuente: no tener cuota no es un
   * error. Lanzar aqui aborta una entrega legal, asi que no se lanza por "no hay
   * nada".
   */
  aportarDatos(gymId: string, memberId: string): Promise<unknown>;
}

export type PersonalDataContributors = readonly PersonalDataContributor[];
