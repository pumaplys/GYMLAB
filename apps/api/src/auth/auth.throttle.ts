import { Inject, Injectable } from '@nestjs/common';
import { authThrottle, eq, sql, withoutTenant, type Database } from '@gymlab/db';
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
 * SEGURIDAD FRENTE A CONCURRENCIA
 *
 * La primera version contaba fallos en `auth_events` y despues decidia. Eso es
 * *comprobar y luego actuar*: entre la lectura y el registro del fallo pasa la
 * verificacion de la contrasena, unos 100 ms. Cincuenta peticiones simultaneas
 * leian todas cero y pasaban todas — el limite se saltaba abriendo conexiones
 * en paralelo.
 *
 * Ahora cada intento ejecuta un UPSERT que incrementa y devuelve el contador en
 * **una sola sentencia**. Postgres bloquea la fila mientras la actualiza, asi
 * que dos peticiones concurrentes obtienen valores distintos. No queda ninguna
 * ventana entre comprobar y actuar.
 *
 * DOS UMBRALES, Y EL MOTIVO DEL SEGUNDO
 *
 * Contar solo por email permitiria **bloquear a una persona concreta** fallando
 * su login a proposito: una denegacion de servicio dirigida. Por eso el umbral
 * estrecho es por pareja (email, IP) y hay otro mas alto por IP suelta. Alguien
 * desde otra IP no puede dejarte fuera de tu cuenta.
 *
 * DOS LIMITES CONOCIDOS, ambos asumidos:
 *
 * - Un ataque distribuido desde muchas IPs lo esquiva. Mitigarlo exige
 *   reputacion de IP o un captcha, y a esta escala no compensa.
 *
 * - Sin `x-forwarded-for` no hay IP y el recuento cae a solo-email, donde si
 *   reaparece el bloqueo dirigido. Se acepta: preferimos un bloqueo de 15
 *   minutos a dejar la puerta abierta. En produccion, detras del proxy del
 *   proveedor, la cabecera existe siempre.
 */

/** Ventana de observacion. */
const VENTANA = '15 minutes';
/** Intentos permitidos para la misma pareja email + IP. */
const MAX_POR_EMAIL_E_IP = 5;
/** Intentos permitidos desde una IP, sumando todas las cuentas. */
const MAX_POR_IP = 20;

@Injectable()
export class AuthThrottle {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Registra un intento y devuelve `true` si hay que rechazarlo.
   *
   * Se llama ANTES de verificar la contrasena: el objetivo es limitar el numero
   * de intentos, no el de fracasos.
   */
  async registrarIntentoYComprobar(email: string, ip: string | null): Promise<boolean> {
    const porEmail = await this.incrementar(`login:${email}:${ip ?? 'sin-ip'}`);
    if (porEmail > MAX_POR_EMAIL_E_IP) return true;

    if (ip) {
      const porIp = await this.incrementar(`login:${ip}`);
      if (porIp > MAX_POR_IP) return true;
    }

    return false;
  }

  /** Un login correcto limpia el contador: a quien acierta no se le penaliza. */
  async limpiar(email: string, ip: string | null): Promise<void> {
    await withoutTenant(this.db, (tx) =>
      tx.delete(authThrottle).where(eq(authThrottle.key, `login:${email}:${ip ?? 'sin-ip'}`)),
    );
  }

  /**
   * Incrementa el contador de una clave y devuelve el valor resultante.
   *
   * Una sola sentencia: el `ON CONFLICT DO UPDATE` bloquea la fila, de modo que
   * dos llamadas simultaneas se serializan y reciben numeros distintos. Ahi esta
   * la garantia frente a concurrencia.
   *
   * El `CASE` reinicia la cuenta cuando la ventana anterior ha expirado, sin
   * necesitar un proceso que limpie para que el limite vuelva a permitir pasar.
   */
  private async incrementar(clave: string): Promise<number> {
    const resultado = await withoutTenant(this.db, (tx) =>
      tx.execute<{ attempts: number }>(sql`
        INSERT INTO auth_throttle (key, window_start, attempts)
        VALUES (${clave}, now(), 1)
        ON CONFLICT (key) DO UPDATE SET
          attempts = CASE
            WHEN auth_throttle.window_start < now() - ${VENTANA}::interval THEN 1
            ELSE auth_throttle.attempts + 1
          END,
          window_start = CASE
            WHEN auth_throttle.window_start < now() - ${VENTANA}::interval THEN now()
            ELSE auth_throttle.window_start
          END
        RETURNING attempts
      `),
    );
    return resultado.rows[0]?.attempts ?? 1;
  }
}
