import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, consents, desc, eq, isNull } from '@gymlab/db';
import { CONSENT_NOT_CONFIGURED, CONSENT_REQUIRED } from '@gymlab/contracts';
import { requireTransaction } from '../common/request-context';
import { env } from '../config/env';

/**
 * La puerta del consentimiento para datos de salud (RGPD art. 9).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VIVE EN EL SERVICIO Y NO EN UN GUARD, a proposito.                        │
 * │                                                                          │
 * │ Un guard se aplica a rutas. Esta regla no es de rutas: es que ningun dato │
 * │ de salud puede entrar en la base de datos sin base legal, venga de un     │
 * │ controlador, de un trabajo de fondo, de una importacion o de un script.   │
 * │ Puesta aqui, el punto de entrada da igual.                                │
 * │                                                                          │
 * │ Y FALLA EN CERRADO: sin version configurada no hay consentimiento posible │
 * │ y no se registra nada. Es el mismo criterio que `app_current_gym_id()`    │
 * │ devolviendo NULL cuando falta contexto — un olvido no puede convertirse   │
 * │ en un tratamiento sin amparo.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class ConsentGate {
  /**
   * Exige consentimiento vigente, o lanza.
   *
   * Devuelve la version aceptada para que quien escriba la guarde junto al dato:
   * ante una reclamacion hay que poder demostrar bajo que texto se recogio cada
   * medicion concreta, y eso no se deduce de la tabla de consentimientos si
   * despues cambia de version.
   */
  async exigirConsentimientoDeSalud(gymId: string, memberId: string): Promise<string> {
    const versionVigente = env.HEALTH_CONSENT_VERSION;

    if (!versionVigente) {
      throw new ForbiddenException({
        code: CONSENT_NOT_CONFIGURED,
        message:
          'No hay ninguna version del consentimiento de datos de salud configurada, ' +
          'asi que no se puede registrar ni modificar ningun dato de progreso. ' +
          'Falta el texto legal, no una opcion tecnica.',
      });
    }

    const tx = requireTransaction();
    const [vigente] = await tx
      .select({ version: consents.version })
      .from(consents)
      .where(
        and(
          eq(consents.gymId, gymId),
          eq(consents.memberId, memberId),
          eq(consents.purpose, 'health_data'),
          // La comparacion contra la version EXACTA es lo que obliga a volver a
          // aceptar cuando cambia el texto: un consentimiento de la version
          // anterior deja de valer solo, sin que nadie tenga que invalidarlo.
          eq(consents.version, versionVigente),
          isNull(consents.revokedAt),
        ),
      )
      .orderBy(desc(consents.grantedAt))
      .limit(1);

    if (!vigente) {
      throw new ForbiddenException({
        code: CONSENT_REQUIRED,
        message:
          `Este socio no ha aceptado la version vigente del consentimiento de datos ` +
          `de salud (${versionVigente}). Sin el no se pueden registrar ni modificar ` +
          `sus datos de progreso.`,
      });
    }

    return vigente.version;
  }

  /** Si lo hay, para poder mostrarlo sin provocar un error. */
  async estadoDeConsentimiento(
    gymId: string,
    memberId: string,
  ): Promise<{ configurada: string | null; aceptada: boolean }> {
    const versionVigente = env.HEALTH_CONSENT_VERSION ?? null;
    if (!versionVigente) return { configurada: null, aceptada: false };

    try {
      await this.exigirConsentimientoDeSalud(gymId, memberId);
      return { configurada: versionVigente, aceptada: true };
    } catch {
      return { configurada: versionVigente, aceptada: false };
    }
  }
}
