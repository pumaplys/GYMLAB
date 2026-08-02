import type { Member as MemberRow } from '@gymlab/db';
import type { Member } from '@gymlab/contracts';

/**
 * Fila de `members` -> lo que sale por la API.
 *
 * Funcion suelta y no un metodo del servicio porque `trainers` tambien devuelve
 * fichas de socio —las de sus asignados— y las dos deben coincidir campo por
 * campo. Con dos copias, el dia que se anada una columna una de ellas se olvida.
 *
 * Es una funcion pura, asi que importarla NO crea dependencia entre modulos: no
 * hay inyeccion, no hay estado y no puede participar en un ciclo del contenedor.
 */
export function memberToDto(fila: MemberRow): Member {
  return {
    id: fila.id,
    memberNumber: fila.memberNumber,
    firstName: fila.firstName,
    lastName: fila.lastName,
    email: fila.email,
    phone: fila.phone,
    birthDate: fila.birthDate,
    status: fila.status,
    joinedAt: fila.joinedAt.toISOString(),
    leftAt: fila.leftAt?.toISOString() ?? null,
    // Se expone si tiene cuenta, no el id de usuario: el panel no necesita ese
    // identificador y no hay razon para difundirlo.
    hasAccount: fila.userId !== null,
  };
}
