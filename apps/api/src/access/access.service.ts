import { Injectable } from '@nestjs/common';
import {
  accessEvents,
  accessTokens,
  and,
  count,
  desc,
  eq,
  sql,
  type AccessDecision,
  type AccessReason,
} from '@gymlab/db';
import type {
  AccessEventList,
  AccessResult,
  AccessTokenResponse,
  ListAccessEventsQuery,
} from '@gymlab/contracts';
import { BillingService } from '../billing/billing.service';
import { requireRequestContext, requireTransaction } from '../common/request-context';
import { env } from '../config/env';
import { MembersService } from '../members/members.service';
import { firmarToken, TTL_MS, verificarToken } from './access-token';

/**
 * Cuanto tiempo se repite la decision ya tomada ante un reintento del MISMO
 * escaner.
 *
 * Existe por un caso que no es un ataque y va a pasar en la puerta: la peticion
 * entro, la respuesta se perdio por la red, y el escaner reintenta. Sin esto, el
 * socio se queda fuera con el torno cerrado y recepcion llamando por telefono.
 *
 * Tres segundos es margen de sobra para un reintento y demasiado poco para pasar
 * el telefono a otra persona.
 */
const VENTANA_REINTENTO_MS = 3_000;

@Injectable()
export class AccessService {
  constructor(
    private readonly members: MembersService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Genera el QR del socio. NO escribe nada.
   *
   * Tampoco comprueba la cuota: el token dice quien eres, no si puedes pasar. Si
   * el estado viajara dentro seria una foto vieja, y bastaria generar el token
   * estando al corriente para entrar despues de vencer.
   */
  async generarToken(gymId: string, userId: string): Promise<AccessTokenResponse> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    const { token, payload } = firmarToken(env.ACCESS_TOKEN_SECRET, gymId, ficha.id);

    return {
      token,
      expiresAt: payload.expiresAt.toISOString(),
      ttlSeconds: Math.round(TTL_MS / 1000),
    };
  }

  /**
   * Verifica un QR y decide. El corazon del modulo.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ EL `gym_id` SALE DE LA SESION DEL ESCANER, NUNCA DEL TOKEN.               │
   * │                                                                          │
   * │ Si la firma no valida, lo que dice el token no es de fiar; pero el        │
   * │ intento hay que registrarlo igual, y en el gimnasio correcto. Ademas la   │
   * │ clave de verificacion se deriva de ESE gimnasio, asi que un token de otro │
   * │ falla la firma por construccion.                                          │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  async verificar(gymId: string, token: string): Promise<AccessResult> {
    const { userId: actorUserId, sessionId } = requireRequestContext();

    const comprobado = verificarToken(env.ACCESS_TOKEN_SECRET, gymId, token);
    if (!comprobado.ok) {
      // Sin `jti` ni socio: no se sabe quien lo presento.
      return this.registrar(gymId, {
        decision: 'DENY',
        reason: comprobado.error,
        memberId: null,
        jti: null,
        diasRestantes: null,
        member: null,
        actorUserId,
      });
    }

    const { memberId, jti, expiresAt } = comprobado.payload;

    // Quien es y si puede pasar. Dos preguntas distintas a proposito: "no paga"
    // y "ya no es socio" son avisos distintos en el mostrador.
    const ficha = await this.buscarFicha(gymId, memberId);
    if (!ficha) {
      return this.registrar(gymId, {
        decision: 'DENY',
        reason: 'UNKNOWN_MEMBER',
        memberId: null,
        jti,
        diasRestantes: null,
        member: null,
        actorUserId,
      });
    }

    const resuelto =
      ficha.status !== 'active'
        ? { decision: 'DENY' as AccessDecision, reason: 'MEMBER_INACTIVE' as AccessReason, dias: null }
        : await this.decidirPorCuota(gymId, memberId);

    // ─── El consumo del jti. Aqui esta el uso unico ────────────────────────
    //
    // UNA SOLA SENTENCIA, y es lo que lo hace a prueba de carreras: no hay
    // comprobacion previa que pueda quedarse obsoleta entre el SELECT y el
    // INSERT. Con dos escaneres simultaneos, PostgreSQL serializa sobre la clave
    // primaria y exactamente uno recibe la fila.
    //
    // Se consume TAMBIEN cuando la decision es DENY: un token representa un
    // intento de acceso, y sin fila no habria decision guardada que repetir ante
    // un reintento de red.
    const tx = requireTransaction();
    const ganado = await tx
      .insert(accessTokens)
      .values({
        jti,
        gymId,
        memberId,
        decision: resuelto.decision,
        reason: resuelto.reason,
        consumedBySessionId: sessionId,
        expiresAt,
      })
      .onConflictDoNothing({ target: accessTokens.jti })
      .returning({ jti: accessTokens.jti });

    if (ganado[0]) {
      return this.registrar(gymId, {
        decision: resuelto.decision,
        reason: resuelto.reason,
        memberId,
        jti,
        diasRestantes: resuelto.dias,
        member: ficha,
        actorUserId,
      });
    }

    // ─── Ya estaba consumido ───────────────────────────────────────────────
    return this.repetirODenegar(gymId, {
      jti,
      sessionId,
      memberId,
      member: ficha,
      dias: resuelto.dias,
      actorUserId,
    });
  }

  /**
   * Un `jti` que ya se habia usado.
   *
   * Si vuelve del MISMO escaner dentro de la ventana, es un reintento por red y
   * se devuelve la decision que ya se tomo. En cualquier otro caso es una
   * reutilizacion: token compartido, capturado o reproducido.
   *
   * La identidad del dispositivo es la SESION, que el servidor deriva del token
   * de sesion y el cliente no puede falsificar — es su propia credencial. La IP
   * no serviria: dos tablets tras el router del gimnasio la comparten.
   */
  private async repetirODenegar(
    gymId: string,
    datos: {
      jti: string;
      sessionId: string;
      memberId: string;
      member: FichaMinima;
      dias: number | null;
      actorUserId: string;
    },
  ): Promise<AccessResult> {
    const tx = requireTransaction();
    const [previo] = await tx
      .select()
      .from(accessTokens)
      .where(and(eq(accessTokens.gymId, gymId), eq(accessTokens.jti, datos.jti)))
      .limit(1);

    const mismoDispositivo = previo?.consumedBySessionId === datos.sessionId;
    const dentroDeVentana =
      previo != null && Date.now() - previo.consumedAt.getTime() <= VENTANA_REINTENTO_MS;

    if (previo && mismoDispositivo && dentroDeVentana) {
      return this.registrar(gymId, {
        decision: previo.decision,
        reason: previo.reason,
        memberId: datos.memberId,
        jti: datos.jti,
        diasRestantes: datos.dias,
        member: datos.member,
        actorUserId: datos.actorUserId,
        // Marcado como repeticion para que la asistencia no cuente dos veces la
        // misma entrada: sin esto, un escaner con mala cobertura inflaria las
        // metricas del dashboard.
        isRetry: true,
      });
    }

    return this.registrar(gymId, {
      decision: 'DENY',
      reason: 'TOKEN_REUSED',
      memberId: datos.memberId,
      jti: datos.jti,
      diasRestantes: datos.dias,
      member: datos.member,
      actorUserId: datos.actorUserId,
    });
  }

  /** Traduce el estado de cuota del modulo 3 al semaforo de la puerta. */
  private async decidirPorCuota(
    gymId: string,
    memberId: string,
  ): Promise<{ decision: AccessDecision; reason: AccessReason; dias: number | null }> {
    const cuota = await this.billing.estadoDe(gymId, memberId);

    // Se parte de `puedeAcceder`, que `billing` ya devuelve resuelto, en lugar de
    // enumerar estados aqui: anadir un estado nuevo alli no debe abrir la puerta
    // por descuido.
    if (!cuota.puedeAcceder) {
      return {
        decision: 'DENY',
        reason: cuota.estado === 'SIN_SUSCRIPCION' ? 'NO_SUBSCRIPTION' : 'DUES_EXPIRED',
        dias: cuota.diasRestantes,
      };
    }

    if (cuota.estado === 'AL_CORRIENTE') {
      return { decision: 'ALLOW', reason: 'OK', dias: cuota.diasRestantes };
    }

    // POR_VENCER y EN_GRACIA dejan pasar, pero avisando: es la diferencia entre
    // que recepcion cobre hoy o persiga al socio dentro de un mes.
    return { decision: 'WARN', reason: 'DUES_WARN', dias: cuota.diasRestantes };
  }

  /** Escribe el evento y devuelve la respuesta. Todo intento queda registrado. */
  private async registrar(
    gymId: string,
    datos: {
      decision: AccessDecision;
      reason: AccessReason;
      memberId: string | null;
      jti: string | null;
      diasRestantes: number | null;
      member: FichaMinima | null;
      actorUserId: string;
      isRetry?: boolean;
    },
  ): Promise<AccessResult> {
    const tx = requireTransaction();

    await tx.insert(accessEvents).values({
      gymId,
      memberId: datos.memberId,
      decision: datos.decision,
      reason: datos.reason,
      jti: datos.jti,
      isRetry: datos.isRetry ?? false,
      scannedByUserId: datos.actorUserId,
    });

    return {
      decision: datos.decision,
      reason: datos.reason,
      // Se construye explicitamente: `status` es interno y no tiene por que
      // viajar al escaner solo porque la consulta lo trajera.
      member: datos.member
        ? {
            id: datos.member.id,
            memberNumber: datos.member.memberNumber,
            firstName: datos.member.firstName,
            lastName: datos.member.lastName,
          }
        : null,
      diasRestantes: datos.diasRestantes,
      isRetry: datos.isRetry ?? false,
    };
  }

  /**
   * Metricas de asistencia para el panel.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ DOS DETALLES QUE CAMBIAN EL NUMERO, y los dos son faciles de olvidar:     │
   * │                                                                          │
   * │ 1. Se excluyen las repeticiones (`is_retry`). Un escaner con mala         │
   * │    cobertura reintenta, y contar esas repeticiones inflaria la            │
   * │    asistencia con entradas que no ocurrieron.                             │
   * │                                                                          │
   * │ 2. `sociosDistintos` es `count(DISTINCT member_id)`, no la suma de        │
   * │    entradas: quien viene cuatro veces cuenta UNA. Es la diferencia entre  │
   * │    "cuanto se usa el gimnasio" y "cuanta gente lo usa", y un dueno decide │
   * │    cosas distintas con cada una.                                          │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * OJO CON EL HORIZONTE: `access_events` se purga segun la retencion de cada
   * gimnasio (12 meses por defecto). Pedir una ventana mayor no da error, da
   * menos datos. Si algun dia hace falta comparar con el ano pasado, habra que
   * calcular agregados ANTES de que la purga se lleve el detalle.
   */
  async stats(gymId: string, dias: number) {
    const tx = requireTransaction();

    const resumen = await tx.execute<{
      entradas: string;
      socios: string;
      denegados: string;
    }>(sql`
      SELECT count(*) FILTER (WHERE decision <> 'DENY' AND is_retry = false) AS entradas,
             count(DISTINCT member_id) FILTER (WHERE decision <> 'DENY' AND is_retry = false) AS socios,
             count(*) FILTER (WHERE decision = 'DENY') AS denegados
      FROM access_events
      WHERE gym_id = ${gymId}
        AND occurred_at >= now() - (${dias}::int * INTERVAL '1 day')
    `);

    // La serie se agrupa por el dia DEL GIMNASIO, no del servidor: una entrada
    // de las 00:30 en Madrid pertenece a ese dia, no al anterior en UTC.
    const serie = await tx.execute<{ dia: string; entradas: string }>(sql`
      SELECT (e.occurred_at AT TIME ZONE g.timezone)::date AS dia,
             count(*) AS entradas
      FROM access_events e
      JOIN gyms g ON g.id = e.gym_id
      WHERE e.gym_id = ${gymId}
        AND e.decision <> 'DENY'
        AND e.is_retry = false
        AND e.occurred_at >= now() - (${dias}::int * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY 1
    `);

    const f = resumen.rows[0];
    return {
      entradas: Number(f?.entradas ?? 0),
      sociosDistintos: Number(f?.socios ?? 0),
      accesosDenegados: Number(f?.denegados ?? 0),
      porDia: serie.rows.map((r) => ({ dia: String(r.dia), entradas: Number(r.entradas) })),
    };
  }

  /**
   * Se pide a `members`, no se lee su tabla (ADR-0006).
   *
   * `findById` existe precisamente para esto: aqui hace falta distinguir "no
   * existe" para poder responder `UNKNOWN_MEMBER` y dejar registrado el intento,
   * en lugar de propagar un 404 que lo dejaria sin rastro.
   */
  private async buscarFicha(gymId: string, memberId: string): Promise<FichaMinima | null> {
    return this.members.findById(gymId, memberId);
  }

  // --- Historial -----------------------------------------------------------

  async listarEventos(gymId: string, query: ListAccessEventsQuery): Promise<AccessEventList> {
    const tx = requireTransaction();

    const condiciones = [eq(accessEvents.gymId, gymId)];
    if (query.memberId) condiciones.push(eq(accessEvents.memberId, query.memberId));
    const where = and(...condiciones);

    const [filas, [total]] = await Promise.all([
      tx
        .select()
        .from(accessEvents)
        .where(where)
        .orderBy(desc(accessEvents.occurredAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      tx.select({ n: count() }).from(accessEvents).where(where),
    ]);

    // El nombre se pide a `members` en lugar de unir contra su tabla (ADR-0006).
    // Una sola consulta para toda la pagina, no una por fila.
    //
    // Los intentos con token invalido no tienen socio —y son justo los que mas
    // interesa mirar—, asi que su nombre queda a null en lugar de excluirlos.
    const ids = [...new Set(filas.map((f) => f.memberId).filter((id): id is string => id !== null))];
    const nombres = new Map(
      (await this.members.byIds(gymId, ids)).map((m) => [m.id, `${m.firstName} ${m.lastName}`]),
    );

    return {
      items: filas.map((f) => ({
        id: f.id,
        memberId: f.memberId,
        memberName: f.memberId ? (nombres.get(f.memberId) ?? null) : null,
        decision: f.decision,
        reason: f.reason,
        isRetry: f.isRetry,
        occurredAt: f.occurredAt.toISOString(),
      })),
      total: Number(total?.n ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

}

interface FichaMinima {
  id: string;
  memberNumber: number;
  firstName: string;
  lastName: string;
  status?: string;
}
