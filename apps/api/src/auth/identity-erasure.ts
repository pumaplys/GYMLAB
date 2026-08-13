import { Injectable } from '@nestjs/common';
import { and, count, eq, memberships, sql, users, type Transaction } from '@gymlab/db';
import type { MemberErasedEvent, MemberErasedHook } from '../common/member-erased-hooks';

/**
 * Lo que `identity` hace cuando se borra la ficha de un socio (art. 17).
 *
 * Dos pasos, y el segundo es condicional.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 1. LA PERTENENCIA DE ESE GIMNASIO, Y SOLO ESA.                           │
 * │                                                                          │
 * │ Se borra la fila `(gym_id, user_id, role='member')`. Los tres filtros    │
 * │ importan:                                                                │
 * │                                                                          │
 * │   gym_id  porque la misma cuenta puede ser socia de otro gimnasio, y ese │
 * │           no ha pedido nada.                                             │
 * │   role    porque la misma cuenta puede ser ADEMAS recepcion o entrenador │
 * │           en este mismo gimnasio. Se le borra la ficha de socio, no el   │
 * │           puesto de trabajo.                                             │
 * │                                                                          │
 * │ Se BORRA y no se termina con `ended_at`, a diferencia de retirar el      │
 * │ acceso al personal: una pertenencia terminada sigue diciendo que esa     │
 * │ persona estuvo en este gimnasio, y eso es justo el vinculo que el art.   │
 * │ 17 obliga a eliminar. Retirar el acceso conserva historial a proposito;  │
 * │ el derecho al olvido lo elimina a proposito.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 2. LA CUENTA, SOLO SI NO LE QUEDA NINGUNA PERTENENCIA.                   │
 * │                                                                          │
 * │ Y basta con mirar `memberships`, que es tabla de este modulo. Parece      │
 * │ poco —¿y el perfil de entrenador?, ¿y las invitaciones que emitio?— pero │
 * │ las dos preguntas se responden solas:                                     │
 * │                                                                          │
 * │   Un perfil de `trainers` SIEMPRE trae pertenencia: se crea al aceptar   │
 * │   una invitacion de rol `trainer`, que crea las dos filas a la vez.      │
 * │                                                                          │
 * │   Quien emitio invitaciones fue dueno o recepcion —`CAN_INVITE.member`   │
 * │   es una lista vacia, un socio no invita a nadie— y retirar el acceso al │
 * │   personal TERMINA la pertenencia con `ended_at`, no la borra. La fila   │
 * │   sigue ahi y este recuento la ve.                                        │
 * │                                                                          │
 * │ Se cuentan las filas, vigentes o terminadas: una pertenencia terminada   │
 * │ sigue siendo historial de esa cuenta en GYMLAB.                          │
 * │                                                                          │
 * │ Esto importa porque `invitations.invited_by_user_id` es RESTRICT en la   │
 * │ base de datos: PostgreSQL RECHAZA borrar una cuenta que haya invitado a  │
 * │ alguien —esa fila responde a "quien dio acceso a quien", rastro de       │
 * │ seguridad— y llegar ahi seria un 500. No se llega, y no por suerte: la   │
 * │ pertenencia de quien invito sigue existiendo y para el recuento.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Mirar solo la tabla propia no es una simplificacion comoda: leer `trainers` o
 * `invitations` desde aqui cruzaria una frontera de ADR-0006, y el proyecto
 * tiene una prueba que lo detecta. La primera version de este fichero las leia
 * y esa prueba la puso en rojo.
 *
 * Al borrar `users`, las claves ajenas hacen el resto por su cuenta:
 * `accounts` y `sessions` caen en cascada —credenciales y sesiones abiertas—,
 * mientras que `audit_log`, `auth_events` y quien registro un pago o una
 * medicion quedan en `SET NULL`: el hecho se conserva, el autor se anonimiza.
 *
 * Clase dedicada y sin dependencias, como los otros implementadores de hooks:
 * inyectar aqui `MembersService` cerraria un ciclo de proveedores con el que
 * Nest se queda colgado en el arranque sin ningun error (ADR-0010).
 */
@Injectable()
export class IdentityErasure implements MemberErasedHook {
  async onMemberErased({ gymId, userId, tx }: MemberErasedEvent): Promise<void> {
    // Sin cuenta no hay nada que hacer, y es el caso mas frecuente.
    if (!userId) return;

    await tx
      .delete(memberships)
      .where(
        and(
          eq(memberships.gymId, gymId),
          eq(memberships.userId, userId),
          eq(memberships.role, 'member'),
        ),
      );

    if (await this.leQuedaAlgunGimnasio(tx, userId)) return;

    await tx.delete(users).where(eq(users.id, userId));
  }

  /**
   * ¿Le queda alguna pertenencia, EN CUALQUIER GIMNASIO?
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ RLS DEJA CIEGO ESTE RECUENTO, Y COSTO UNA PRUEBA EN ROJO DESCUBRIRLO.   │
   * │                                                                          │
   * │ La peticion corre con el contexto del gimnasio que borra, y la politica  │
   * │ de `memberships` es:                                                     │
   * │                                                                          │
   * │     gym_id = app_current_gym_id() OR user_id = app_current_user_id()     │
   * │                                                                          │
   * │ Contando tal cual, las pertenencias de esa persona en OTROS gimnasios    │
   * │ son invisibles. El recuento daba cero, la cuenta parecia huerfana, se    │
   * │ borraba `users` — y la cascada, que no pasa por RLS, se llevaba por      │
   * │ delante su pertenencia al otro gimnasio. Un gimnasio borraba datos de    │
   * │ otro sin que nadie viera un error.                                       │
   * │                                                                          │
   * │ La salida no es saltarse RLS: es usar la segunda rama de la politica,    │
   * │ que existe precisamente para "mis propias pertenencias" y la usa ya      │
   * │ `/v1/auth/me`. Se fija `app.user_id` a la cuenta que se esta evaluando,  │
   * │ se cuenta, y se restaura el valor anterior — el actor de la peticion —   │
   * │ para no dejar el contexto cambiado a media transaccion.                  │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  private async leQuedaAlgunGimnasio(tx: Transaction, userId: string): Promise<boolean> {
    const previo = await tx.execute<{ actor: string | null }>(
      sql`SELECT current_setting('app.user_id', true) AS actor`,
    );
    const actor = previo.rows[0]?.actor ?? '';

    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    try {
      const [fila] = await tx
        .select({ n: count() })
        .from(memberships)
        .where(eq(memberships.userId, userId));
      return Number(fila?.n ?? 0) > 0;
    } finally {
      // En `finally` a proposito: si el recuento falla, el contexto tiene que
      // volver a su sitio igual. Dejarlo cambiado seria peor que el fallo.
      await tx.execute(sql`SELECT set_config('app.user_id', ${actor}, true)`);
    }
  }
}
