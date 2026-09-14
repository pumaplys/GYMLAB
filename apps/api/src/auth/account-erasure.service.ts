import { Injectable } from '@nestjs/common';
import {
  and,
  authEvents,
  eq,
  gyms,
  isNull,
  memberships,
  ne,
  sql,
  users,
  type Transaction,
} from '@gymlab/db';
import { requireTransaction } from '../common/request-context';
import { InvitationsService } from '../invitations/invitations.service';
import { MembersService } from '../members/members.service';

/**
 * Borrar la identidad RINDA de una persona, entera y en todas partes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES «SALIR DE UN GIMNASIO». ES EL ARTICULO 17 SOBRE LA CUENTA.        │
 * │                                                                          │
 * │ Ya existia `MembersService.erase`, que borra la FICHA de un socio en UN  │
 * │ gimnasio y lo dispara el personal. Es el mismo derecho, ejercido por     │
 * │ otra persona y con otro alcance. Aqui NO se reimplementa: se recorre     │
 * │ cada gimnasio donde esa cuenta tiene ficha y se llama a ese mismo        │
 * │ servicio. Dos implementaciones divergentes del articulo 17 serian dos    │
 * │ sitios donde olvidarse de una tabla.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL AISLAMIENTO ENTRE GIMNASIOS SE MANTIENE DURANTE TODA LA OPERACION.   │
 * │                                                                          │
 * │ `members`, `body_metrics`, `consents` y compañia tienen RLS de           │
 * │ `gym_id = app_current_gym_id()`. Una sola transaccion con el gimnasio    │
 * │ activo de la sesion no VERIA las fichas de los demas: el borrado         │
 * │ parecería completo y dejaria media identidad viva en otro tenant.        │
 * │                                                                          │
 * │ Por eso se cambia `app.gym_id` gimnasio a gimnasio DENTRO de la misma    │
 * │ transaccion, se hace el trabajo de ese gimnasio, y se pasa al siguiente. │
 * │ En ningun momento hay un contexto que vea dos gimnasios a la vez.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class AccountErasureService {
  constructor(
    private readonly socios: MembersService,
    private readonly invitaciones: InvitationsService,
  ) {}

  /**
   * Los gimnasios que impiden completar el borrado. Sin efectos.
   *
   * Hoy hay un unico motivo y es deliberado: dejar un gimnasio ACTIVO SIN
   * DUEÑO. Ese gimnasio tiene socios que pagan, cuotas que vencen y una puerta
   * que abrir, y nadie podria administrarlo ni invitar a quien lo administre.
   *
   * NO se borra el gimnasio, y no es una omision: el gimnasio no es suyo para
   * llevarselo — dentro hay datos de otras personas. Lo que se le pide es que
   * invite a otro dueño, que es un flujo que ya existe.
   */
  async bloqueos(userId: string): Promise<{ gymId: string; nombre: string }[]> {
    const tx = requireTransaction();

    // Con la misma cautela que `pertenenciasDe`: sin `app.user_id` fijado,
    // los gimnasios donde es dueña pero que no son el activo no se verian, y
    // el bloqueo diria que si a un borrado que deja un gimnasio sin dueño.
    const suyos = await this.comoElUsuario(tx, userId, () =>
      tx
        .select({ gymId: memberships.gymId })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.role, 'owner'),
            isNull(memberships.endedAt),
          ),
        ),
    );

    const bloqueos: { gymId: string; nombre: string }[] = [];
    for (const { gymId } of suyos) {
      const [otro] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.gymId, gymId),
            eq(memberships.role, 'owner'),
            isNull(memberships.endedAt),
            ne(memberships.userId, userId),
          ),
        )
        .limit(1);

      if (otro) continue;

      const [gimnasio] = await tx
        .select({ nombre: gyms.name })
        .from(gyms)
        .where(eq(gyms.id, gymId))
        .limit(1);

      bloqueos.push({ gymId, nombre: gimnasio?.nombre ?? gymId });
    }

    return bloqueos;
  }

  /**
   * Borra la cuenta. Todo o nada.
   *
   * Devuelve los bloqueos SIN borrar nada si los hay. No lanza: «todavia no
   * puedes» no es un error del sistema, es una respuesta que la pantalla tiene
   * que poder explicar con el nombre del gimnasio delante.
   */
  async borrar(userId: string): Promise<
    { ok: true } | { ok: false; bloqueos: { gymId: string; nombre: string }[] }
  > {
    const tx = requireTransaction();

    const bloqueos = await this.bloqueos(userId);
    if (bloqueos.length > 0) return { ok: false, bloqueos };

    const correo = await this.correoDe(tx, userId);

    /*
     * Las fichas de socio, gimnasio por gimnasio y con el contexto de cada uno.
     *
     * Se leen las PERTENENCIAS y no las fichas: `memberships` tiene una rama de
     * RLS por `user_id` —«mis propias pertenencias»— que sigue siendo visible
     * sin contexto de gimnasio. Las fichas no la tienen, asi que sin esto no
     * habria forma de saber a que gimnasios hay que entrar.
     */
    const pertenencias = await this.pertenenciasDe(tx, userId);

    for (const gymId of [...new Set(pertenencias.map((p) => p.gymId))]) {
      await this.enElGimnasio(tx, gymId, userId, async () => {
        /*
         * Se le PIDE a cada modulo la operacion sobre su propia tabla, no se
         * leen sus filas desde aqui (ADR-0006). Ese es el mismo borrado del
         * articulo 17 que ejecuta el personal, no una segunda version.
         */
        await this.socios.eraseProfileOf(gymId, userId);
        if (correo) await this.invitaciones.anonimizarCorreo(correo);
      });
    }

    /*
     * Lo que queda es de `identity`, que es este modulo:
     *
     *   memberships   las de PERSONAL, que no cuelgan de ninguna ficha;
     *   users         y con ella, en cascada, `accounts` —las credenciales—,
     *                 `sessions` —todas, en todos los dispositivos—,
     *                 `consents` y `trainers`.
     *
     * Borrar las pertenencias primero no es cosmetico: `memberships` no tiene
     * cascada desde `members`, y una pertenencia huerfana dejaria el gimnasio
     * en el selector de una cuenta que ya no existe.
     */
    await tx.delete(memberships).where(eq(memberships.userId, userId));

    await this.borrarPiiSuelta(tx, correo);

    await tx.delete(users).where(eq(users.id, userId));

    return { ok: true };
  }

  // --- Lo que las claves ajenas no alcanzan --------------------------------

  /**
   * Los datos personales que viven en columnas de texto, no en relaciones.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ PONER UNA FK A NULL NO ES ANONIMIZAR.                                │
   * │                                                                      │
   * │ `auth_events` guarda el correo TECLEADO en cada intento de entrada,  │
   * │ acertado o no, en `email_attempted`. Al borrar la cuenta, `user_id`  │
   * │ se ponia a NULL por la clave ajena y el correo se quedaba escrito en │
   * │ claro — y un correo identifica a una persona por si solo.            │
   * │                                                                      │
   * │ La fila se conserva porque es un registro de SEGURIDAD: cuantos      │
   * │ intentos fallidos hubo y desde donde sigue importando. Lo que        │
   * │ desaparece es de quien eran.                                         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  private async borrarPiiSuelta(tx: Transaction, correo: string | null): Promise<void> {
    if (!correo) return;

    await tx
      .update(authEvents)
      .set({ emailAttempted: null })
      .where(eq(authEvents.emailAttempted, correo));
  }

  // --- Utiles -------------------------------------------------------------

  private async correoDe(tx: Transaction, userId: string): Promise<string | null> {
    const [fila] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return fila?.email ?? null;
  }

  /**
   * Los gimnasios donde esa cuenta pertenece. TODOS.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ SIN FIJAR `app.user_id`, ESTA CONSULTA SOLO VE EL GIMNASIO ACTIVO.   │
   * │                                                                      │
   * │ La politica de lectura de `memberships` es                            │
   * │                                                                      │
   * │     gym_id = app_current_gym_id() OR user_id = app_current_user_id()  │
   * │                                                                      │
   * │ y la segunda rama —«mis propias pertenencias»— solo funciona si       │
   * │ `app.user_id` esta puesto. No siempre lo esta.                        │
   * │                                                                      │
   * │ Costo verlo: el borrado recorria UN solo gimnasio, la cuenta quedaba  │
   * │ huerfana y se borraba ahi mismo, y la cascada de `users` dejaba la    │
   * │ ficha del OTRO gimnasio viva con `user_id` a NULL — con su nombre y   │
   * │ su correo dentro. Media identidad viva en otro tenant, que es         │
   * │ exactamente lo que no puede pasar.                                    │
   * │                                                                      │
   * │ Es la misma trampa que ya documenta `identity-erasure.ts`. La salida  │
   * │ tambien: usar la rama que existe para esto, no saltarse RLS.          │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  private async pertenenciasDe(tx: Transaction, userId: string) {
    return this.comoElUsuario(tx, userId, () =>
      tx.select({ gymId: memberships.gymId }).from(memberships).where(eq(memberships.userId, userId)),
    );
  }

  /** Ejecuta `fn` con `app.user_id` fijado, y lo devuelve como estaba. */
  private async comoElUsuario<T>(
    tx: Transaction,
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previo = await tx.execute<{ actor: string | null }>(
      sql`SELECT current_setting('app.user_id', true) AS actor`,
    );
    const actor = previo.rows[0]?.actor ?? '';
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    try {
      return await fn();
    } finally {
      await tx.execute(sql`SELECT set_config('app.user_id', ${actor}, true)`);
    }
  }

  /**
   * Ejecuta `fn` con el contexto de RLS de un gimnasio concreto, y lo devuelve
   * como estaba.
   *
   * Restaurar no es una cortesia: la transaccion sigue viva despues, y dejarla
   * apuntando al ultimo gimnasio recorrido haria que lo siguiente que se
   * escriba caiga en el tenant equivocado.
   */
  private async enElGimnasio<T>(
    tx: Transaction,
    gymId: string,
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previo = await tx.execute<{ gym: string | null; usuario: string | null }>(
      sql`SELECT current_setting('app.gym_id', true) AS gym,
                 current_setting('app.user_id', true) AS usuario`,
    );
    const antes = previo.rows[0] ?? { gym: '', usuario: '' };

    await tx.execute(
      sql`SELECT set_config('app.gym_id', ${gymId}, true),
                 set_config('app.user_id', ${userId}, true)`,
    );
    try {
      return await fn();
    } finally {
      await tx.execute(
        sql`SELECT set_config('app.gym_id', ${antes.gym ?? ''}, true),
                   set_config('app.user_id', ${antes.usuario ?? ''}, true)`,
      );
    }
  }
}

