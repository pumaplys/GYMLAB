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
 * El de IP no es prescindible, aunque lo parezca: es el UNICO que ve el relleno
 * de credenciales —una contrasena filtrada probada contra muchas cuentas—,
 * porque ahi cada cuenta recibe un solo intento y el umbral por email nunca se
 * alcanza. Medido: 30 cuentas distintas desde una IP se frenan en la vigesima.
 *
 * LO QUE CUENTA CADA UNO
 *
 * Los dos suman ANTES de verificar la contrasena, que es la garantia frente a
 * concurrencia. La diferencia esta en lo que pasa despues: al acertar, el de
 * email+IP se borra y el de IP se DESCUENTA (ver `limpiar`). Asi el de IP mide
 * intentos que no salieron bien, y no simple trafico — que es lo que convertia
 * la IP compartida de un gimnasio en un punto unico de bloqueo.
 *
 * TRES LIMITES CONOCIDOS, los tres asumidos:
 *
 * - Un ataque distribuido desde muchas IPs lo esquiva. Mitigarlo exige
 *   reputacion de IP o un captcha, y a esta escala no compensa.
 *
 * - Sin `x-forwarded-for` no hay IP y el recuento cae a solo-email, donde si
 *   reaparece el bloqueo dirigido. Se acepta: preferimos un bloqueo de 15
 *   minutos a dejar la puerta abierta. En produccion, detras del proxy del
 *   proveedor, la cabecera existe siempre.
 *
 * - ⏳ DEUDA: la senal real del relleno no es "muchos intentos desde una IP"
 *   sino "muchas CUENTAS DISTINTAS desde una IP". En los datos medidos, un
 *   ataque toca 30 correos y un gimnasio toca los suyos. Contar correos
 *   distintos separaria los dos casos sin depender de un umbral de trafico,
 *   pero exige otra forma de tabla y decidir que hace la ventana. El descuento
 *   de arriba resuelve el bloqueo del gimnasio; esto seria hacerlo bien.
 */

/** Ventana de observacion. */
const VENTANA = '15 minutes';
/** Intentos permitidos para la misma pareja email + IP. */
const MAX_POR_EMAIL_E_IP = 5;
/**
 * Intentos FALLIDOS permitidos desde una IP, sumando todas las cuentas.
 *
 * Se exporta para que los tests afirmen la relacion con el umbral y no un
 * numero suelto: si algun dia se ajusta, siguen midiendo lo que dicen medir.
 */
export const MAX_POR_IP = 20;

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

  /**
   * Un login correcto no debe dejar rastro en ninguno de los dos contadores.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ EL DESCUENTO POR IP ES LO QUE IMPIDE QUE UN GIMNASIO SE BLOQUEE SOLO.    │
   * │                                                                          │
   * │ Antes solo se borraba la clave de email+IP. El contador por IP seguia    │
   * │ subiendo con CADA peticion, acertara o no, asi que un gimnasio entero    │
   * │ —que sale a internet por una sola direccion— agotaba el presupuesto      │
   * │ usando el producto con normalidad.                                       │
   * │                                                                          │
   * │ Medido antes del cambio: 24 inicios de sesion CORRECTOS seguidos, con    │
   * │ credenciales validas siempre, daban 20 aceptados y 4 rechazados. Y a     │
   * │ partir de ahi cualquier OTRA persona del gimnasio recibia 429 aunque su  │
   * │ contrasena fuera buena.                                                  │
   * │                                                                          │
   * │ El arreglo no es subir el umbral —eso solo traslada el problema a un     │
   * │ gimnasio mas grande—, sino que el contador mida lo que debe medir. Un    │
   * │ intento acertado queda NETO A CERO: +1 antes de comprobar la contrasena, │
   * │ -1 aqui. Lo que se acumula son los que no salieron bien.                 │
   * │                                                                          │
   * │ Y se hace asi, descontando despues, en lugar de contar solo los fallos:  │
   * │ el incremento tiene que seguir ocurriendo ANTES de verificar la          │
   * │ contrasena. Mover el conteo detras reabriria la ventana de ~100 ms entre │
   * │ comprobar y actuar por la que llegaron a pasar 30 peticiones simultaneas.│
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  async limpiar(email: string, ip: string | null): Promise<void> {
    await withoutTenant(this.db, async (tx) => {
      await tx.delete(authThrottle).where(eq(authThrottle.key, `login:${email}:${ip ?? 'sin-ip'}`));

      if (!ip) return;
      // `GREATEST(..., 0)` porque la ventana puede haber expirado entre el
      // incremento y este descuento: sin el, el contador quedaria negativo y
      // regalaria intentos a quien viniera despues.
      await tx.execute(sql`
        UPDATE auth_throttle
        SET attempts = GREATEST(attempts - 1, 0)
        WHERE key = ${`login:${ip}`}
      `);
    });
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
