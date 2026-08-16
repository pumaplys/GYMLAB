import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  auditLog,
  bodyMetrics,
  consents,
  desc,
  eq,
  isNull,
  type BodyMetric as BodyMetricRow,
} from '@gymlab/db';
import type {
  BodyMetric,
  GrantHealthConsentInput,
  HealthConsentStatus,
  RecordBodyMetricInput,
} from '@gymlab/contracts';
import { requireRequestContext, requireTransaction } from '../common/request-context';
import { MembersService } from '../members/members.service';
import { TrainersService } from '../trainers/trainers.service';
import { ConsentDocumentsService } from './consent-documents.service';
import { ConsentGate } from './consent.gate';

/**
 * Peso y medidas corporales. Datos de salud (RGPD art. 9).
 *
 * Dos limites que no impone la base de datos y viven aqui:
 *
 *   1. NINGUNA ESCRITURA SIN CONSENTIMIENTO VIGENTE. La comprobacion esta en
 *      este servicio y no en el controlador, para que se cumpla venga de donde
 *      venga la llamada: un endpoint futuro, una importacion o un trabajo de
 *      fondo pasan por el mismo sitio.
 *
 *   2. RECEPCION NO ACCEDE, y un entrenador solo ve a sus asignados. RLS aisla
 *      entre gimnasios, no dentro de uno.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly members: MembersService,
    private readonly trainers: TrainersService,
    private readonly consentGate: ConsentGate,
    private readonly documentos: ConsentDocumentsService,
  ) {}

  /**
   * Registra una medicion.
   *
   * El consentimiento se exige ANTES de tocar nada, y su version se guarda con el
   * dato: ante una reclamacion hay que poder demostrar bajo que texto se recogio
   * cada medicion concreta.
   */
  async record(
    gymId: string,
    memberId: string,
    input: RecordBodyMetricInput,
  ): Promise<BodyMetric> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    await this.asegurarAcceso(gymId, memberId);
    const consentVersion = await this.consentGate.exigirConsentimientoDeSalud(gymId, memberId);

    const [fila] = await tx
      .insert(bodyMetrics)
      .values({
        gymId,
        memberId,
        measuredAt: input.measuredAt ? new Date(input.measuredAt) : new Date(),
        weightKg: this.aTexto(input.weightKg),
        bodyFatPercent: this.aTexto(input.bodyFatPercent),
        chestCm: this.aTexto(input.chestCm),
        waistCm: this.aTexto(input.waistCm),
        hipCm: this.aTexto(input.hipCm),
        armCm: this.aTexto(input.armCm),
        thighCm: this.aTexto(input.thighCm),
        notes: input.notes ?? null,
        recordedByUserId: actorUserId,
        consentVersion,
      })
      .returning();

    // La auditoria NO guarda los valores: seria una segunda copia de datos de
    // salud, y el registro de auditoria tiene otra retencion y otro acceso.
    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'body_metric.recorded',
      entityType: 'body_metric',
      entityId: fila!.id,
      metadata: { campos: Object.keys(input), consentVersion },
    });

    return this.toDto(fila!);
  }

  /**
   * Borra una medicion.
   *
   * Tambien exige consentimiento vigente. Puede parecer excesivo —borrar reduce
   * el tratamiento, no lo amplia— pero la peticion la hace el personal sobre
   * datos de otra persona, y sin consentimiento vigente no hay relacion que
   * ampare tocarlos. Corregir un error de tecleo no es urgente; recoger un
   * consentimiento, si.
   */
  async remove(gymId: string, memberId: string, id: string): Promise<{ ok: true }> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    await this.asegurarAcceso(gymId, memberId);
    await this.consentGate.exigirConsentimientoDeSalud(gymId, memberId);

    const borradas = await tx
      .delete(bodyMetrics)
      .where(
        and(
          eq(bodyMetrics.gymId, gymId),
          eq(bodyMetrics.memberId, memberId),
          eq(bodyMetrics.id, id),
        ),
      )
      .returning({ id: bodyMetrics.id });

    if (!borradas[0]) throw new NotFoundException('Medicion no encontrada.');

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'body_metric.deleted',
      entityType: 'body_metric',
      entityId: id,
    });

    return { ok: true };
  }

  /**
   * El historial de un socio.
   *
   * LEER NO EXIGE CONSENTIMIENTO VIGENTE, y es deliberado: si alguien lo revoca o
   * cambia la version del texto, el gimnasio debe poder seguir viendo —y
   * borrando a peticion— lo que ya recogio legitimamente. Bloquear la lectura
   * dejaria datos huerfanos que nadie puede ni consultar ni atender.
   */
  async history(gymId: string, memberId: string): Promise<BodyMetric[]> {
    const tx = requireTransaction();
    await this.asegurarAcceso(gymId, memberId);

    const filas = await tx
      .select()
      .from(bodyMetrics)
      .where(and(eq(bodyMetrics.gymId, gymId), eq(bodyMetrics.memberId, memberId)))
      .orderBy(desc(bodyMetrics.measuredAt));

    return filas.map((f) => this.toDto(f));
  }

  // --- El socio y sus propios datos ----------------------------------------

  async myHistory(gymId: string, userId: string): Promise<BodyMetric[]> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    return this.history(gymId, ficha.id);
  }

  async recordMine(
    gymId: string,
    userId: string,
    input: RecordBodyMetricInput,
  ): Promise<BodyMetric> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    return this.record(gymId, ficha.id, input);
  }

  // --- Consentimiento ------------------------------------------------------

  /**
   * Registra la aceptacion del socio.
   *
   * Se comprueba que la version aceptada es la VIGENTE: sin esto, una app
   * antigua podria registrar la aceptacion de un texto que ya no esta en uso, y
   * el consentimiento dejaria de probar lo que se pretende que pruebe.
   */
  async grantHealthConsent(
    gymId: string,
    memberId: string,
    input: GrantHealthConsentInput,
    ip: string | null,
  ): Promise<HealthConsentStatus> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    await this.members.getById(gymId, memberId);

    const documento = await this.documentos.vigente(gymId);
    if (!documento) {
      throw new BadRequestException(
        'Este gimnasio no tiene publicado el documento de consentimiento; no se puede aceptar nada todavia.',
      );
    }
    const vigente = documento.version;
    if (input.version !== vigente) {
      throw new BadRequestException(
        `La version aceptada (${input.version}) no es la vigente (${vigente}).`,
      );
    }

    // IDEMPOTENTE: aceptar dos veces la misma version no crea una segunda fila.
    //
    // En el mostrador se pulsa dos veces, y duplicar la aceptacion no mejora la
    // prueba: la empeora. Ante una autoridad hay que poder decir CUANDO acepto
    // esta persona esta version, no ofrecer tres fechas para lo mismo. El indice
    // unico parcial lo impide ademas en la base de datos; esto evita el error.
    const [ya] = await tx
      .select({ id: consents.id })
      .from(consents)
      .where(
        and(
          eq(consents.gymId, gymId),
          eq(consents.memberId, memberId),
          eq(consents.purpose, 'health_data'),
          eq(consents.documentId, documento.id),
          isNull(consents.revokedAt),
        ),
      )
      .limit(1);

    if (ya) return this.healthConsentStatus(gymId, memberId);

    await tx.insert(consents).values({
      gymId,
      // El documento EXACTO. Es lo que convierte la fila en una prueba: apunta a
      // un texto congelado, no a una etiqueta que manana signifique otra cosa.
      documentId: documento.id,
      // SOLO `member_id`, y no tambien la cuenta.
      //
      // El sujeto del consentimiento es la ficha: el socio consiente que **su
      // gimnasio** trate sus datos, y dentro de un gimnasio la identidad es la
      // ficha, no la cuenta global. Guardar ademas `user_id` era redundante y
      // obligaba a este modulo a leer `members` para averiguarlo, saltandose
      // ADR-0006 por un dato que no aporta: quien registro la aceptacion ya
      // queda en `audit_log`.
      memberId,
      purpose: 'health_data',
      version: vigente,
      ipAddress: ip,
    });

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'consent.granted',
      entityType: 'member',
      entityId: memberId,
      metadata: { purpose: 'health_data', version: vigente },
    });

    return this.healthConsentStatus(gymId, memberId);
  }

  /**
   * Revoca el consentimiento.
   *
   * Es un derecho, no una casilla. A partir de aqui no se puede registrar nada
   * mas, pero lo ya recogido sigue consultable para poder atender una peticion de
   * acceso o de borrado.
   */
  async revokeHealthConsent(gymId: string, memberId: string): Promise<HealthConsentStatus> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    await this.members.getById(gymId, memberId);

    await tx
      .update(consents)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(consents.gymId, gymId),
          eq(consents.memberId, memberId),
          eq(consents.purpose, 'health_data'),
          isNull(consents.revokedAt),
        ),
      );

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'consent.revoked',
      entityType: 'member',
      entityId: memberId,
      metadata: { purpose: 'health_data' },
    });

    return this.healthConsentStatus(gymId, memberId);
  }

  // --- El socio y SU consentimiento ----------------------------------------

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ SIN `memberId` EN NINGUNA PARTE. ESA ES LA SEGURIDAD.                    │
   * │                                                                          │
   * │ Los tres metodos parten del `userId` de la sesion y resuelven la ficha    │
   * │ con `getOwnProfile`. No hay ningun parametro que un socio pueda escribir  │
   * │ para hablar de otro: no es que se valide, es que no existe.               │
   * │                                                                          │
   * │ Y reutilizan los metodos de arriba en lugar de repetir su logica, porque  │
   * │ dos copias de una regla de consentimiento divergen y la que se olvide     │
   * │ sera la que acepte datos de salud sin amparo.                             │
   * └──────────────────────────────────────────────────────────────────────────┘
   */

  /** Mi consentimiento, con el texto que tendria que leer antes de aceptar. */
  async myHealthConsent(gymId: string, userId: string): Promise<HealthConsentStatus> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    return this.healthConsentStatus(gymId, ficha.id);
  }

  /** Acepto yo, para mi. */
  async grantMyHealthConsent(
    gymId: string,
    userId: string,
    input: GrantHealthConsentInput,
    ip: string | null,
  ): Promise<HealthConsentStatus> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    return this.grantHealthConsent(gymId, ficha.id, input, ip);
  }

  /** Retiro yo el mio. Es un derecho y no necesita motivo. */
  async revokeMyHealthConsent(gymId: string, userId: string): Promise<HealthConsentStatus> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    return this.revokeHealthConsent(gymId, ficha.id);
  }

  async healthConsentStatus(gymId: string, memberId: string): Promise<HealthConsentStatus> {
    const tx = requireTransaction();
    const estado = await this.consentGate.estadoDeConsentimiento(gymId, memberId);

    const [ultimo] = await tx
      .select({ grantedAt: consents.grantedAt })
      .from(consents)
      .where(
        and(
          eq(consents.gymId, gymId),
          eq(consents.memberId, memberId),
          eq(consents.purpose, 'health_data'),
          isNull(consents.revokedAt),
        ),
      )
      .orderBy(desc(consents.grantedAt))
      .limit(1);

    /*
     * El TEXTO viaja con el estado, y no es un extra.
     *
     * Un consentimiento del art. 9 tiene que ser informado: una pantalla que
     * diga "acepto la version 2026-09-01" sin ensenar nada no recoge un
     * consentimiento, recoge un clic. Si el estado no trajera el documento, no
     * habria forma de que el socio leyera lo que va a aceptar.
     */
    const documento = await this.documentos.vigente(gymId);

    return {
      currentVersion: estado.configurada,
      accepted: estado.aceptada,
      acceptedAt: estado.aceptada ? (ultimo?.grantedAt.toISOString() ?? null) : null,
      document: documento
        ? {
            id: documento.id,
            version: documento.version,
            title: documento.title,
            body: documento.body,
            controller: documento.controller,
            publishedAt: documento.publishedAt.toISOString(),
          }
        : null,
    };
  }

  // --- Interno -------------------------------------------------------------

  /**
   * Quien puede tocar los datos de este socio.
   *
   * Recepcion no llega hasta aqui —queda fuera por `@Roles`— y el entrenador solo
   * pasa si el socio es suyo, delegando en el modulo de entrenadores para no
   * tener dos copias de la misma regla.
   */
  private async asegurarAcceso(gymId: string, memberId: string): Promise<void> {
    const { userId, role } = requireRequestContext();

    if (role === 'trainer') {
      await this.trainers.myMember(gymId, userId, memberId);
      return;
    }
    if (role === 'member') {
      const ficha = await this.members.getOwnProfile(gymId, userId);
      if (ficha.id !== memberId) {
        throw new NotFoundException('Socio no encontrado.');
      }
      return;
    }
    await this.members.getById(gymId, memberId);
  }


  private aTexto(valor: number | undefined): string | null {
    return valor === undefined ? null : String(valor);
  }

  private aNumero(valor: string | null): number | null {
    return valor === null ? null : Number(valor);
  }

  private toDto(fila: BodyMetricRow): BodyMetric {
    return {
      id: fila.id,
      measuredAt: fila.measuredAt.toISOString(),
      weightKg: this.aNumero(fila.weightKg),
      bodyFatPercent: this.aNumero(fila.bodyFatPercent),
      chestCm: this.aNumero(fila.chestCm),
      waistCm: this.aNumero(fila.waistCm),
      hipCm: this.aNumero(fila.hipCm),
      armCm: this.aNumero(fila.armCm),
      thighCm: this.aNumero(fila.thighCm),
      notes: fila.notes,
      consentVersion: fila.consentVersion,
    };
  }
}
