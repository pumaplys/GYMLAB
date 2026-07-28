import { Inject, Injectable } from '@nestjs/common';
import { authEvents, sql, withoutTenant, type Database } from '@gymlab/db';
import { DATABASE } from '../database/database.module';

/**
 * Limitacion de intentos de autenticacion.
 *
 * POR QUE NO SE USA EL DE BETTER AUTH
 *
 * Better Auth trae rate limiting, pero lo aplica en el `onRequest` de su router
 * HTTP. ADR-0009 decidio no montar ese router y consumir solo su API de
 * servidor, asi que su limitador **no llega a ejecutarse nunca**. Activarlo en
 * la configuracion habria dado una falsa sensacion de proteccion.
 *
 * Es una consecuencia no prevista de ADR-0009. Se asume: la alternativa seria
 * montar el router, y eso reabriria la superficie de rutas que aquella decision
 * cerraba a proposito.
 *
 * COMO FUNCIONA
 *
 * Se cuentan los fallos ya registrados en `auth_events`, que guarda IP y email
 * desde el primer dia. Sin dependencias nuevas, sin tablas nuevas, y a prueba
 * de reinicios y de varias instancias — cosa que un contador en memoria no da.
 *
 * DOS UMBRALES, Y EL MOTIVO DEL SEGUNDO
 *
 * Contar solo por email permitiria a un atacante **bloquear a una persona
 * concreta** fallando adrede su login: una denegacion de servicio dirigida.
 * Por eso el umbral estrecho es por pareja (email, IP) y hay otro mas alto por
 * IP suelta. Alguien desde otra IP no puede dejarte fuera de tu cuenta.
 *
 * DOS LIMITES CONOCIDOS, ambos asumidos:
 *
 * - Un ataque distribuido desde muchas IPs lo esquiva. Mitigarlo exige
 *   reputacion de IP o un captcha, y a esta escala no compensa.
 *
 * - Sin `x-forwarded-for` (peticiones que no pasan por un proxy) no hay IP, y
 *   el recuento cae a solo-email. Ahi si reaparece la posibilidad de bloquear a
 *   alguien a proposito. Se acepta: preferimos un bloqueo temporal de 15
 *   minutos a dejar la puerta abierta. En produccion, detras del proxy del
 *   proveedor, la cabecera existe siempre.
 */

/** Ventana de observacion. */
const VENTANA = '15 minutes';
/** Fallos permitidos para la misma pareja email + IP. */
const MAX_POR_EMAIL_E_IP = 5;
/** Fallos permitidos desde una IP, sumando todas las cuentas. */
const MAX_POR_IP = 20;

@Injectable()
export class AuthThrottle {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Devuelve `true` si hay que rechazar el intento.
   *
   * No lanza: quien llama decide el codigo de respuesta, porque el mensaje
   * cambia segun el flujo.
   */
  async estaBloqueado(email: string, ip: string | null): Promise<boolean> {
    const [porEmail, porIp] = await Promise.all([
      this.contarFallos({ email, ip }),
      ip ? this.contarFallos({ ip }) : Promise.resolve(0),
    ]);

    return porEmail >= MAX_POR_EMAIL_E_IP || porIp >= MAX_POR_IP;
  }

  private async contarFallos(filtro: { email?: string; ip?: string | null }): Promise<number> {
    const condiciones = [
      sql`event_type = 'login_failure'`,
      sql`created_at > now() - ${VENTANA}::interval`,
    ];
    if (filtro.email) condiciones.push(sql`email_attempted = ${filtro.email}`);
    if (filtro.ip) condiciones.push(sql`ip_address = ${filtro.ip}`);

    const where = sql.join(condiciones, sql` AND `);

    const resultado = await withoutTenant(this.db, (tx) =>
      tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM ${authEvents} WHERE ${where}`,
      ),
    );
    return resultado.rows[0]?.n ?? 0;
  }
}
