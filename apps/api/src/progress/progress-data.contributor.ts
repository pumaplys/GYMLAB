import { Injectable } from '@nestjs/common';
import { and, bodyMetrics, consents, desc, eq } from '@gymlab/db';
import type { PersonalDataContributor } from '../common/personal-data';
import { requireTransaction } from '../common/request-context';

/**
 * Lo que el modulo de progreso guarda de un socio, para la exportacion del
 * art. 15 (ADR-0011).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE ES EL QUE MAS FALTA HACIA, Y LLEVABA TIEMPO SIN ESTAR.              │
 * │                                                                          │
 * │ `PersonalDataModule` ya lo habia escrito: "cuando llegue el modulo de    │
 * │ progreso (peso y medidas, art. 9) tendra que registrarse aqui. Si no lo  │
 * │ hace, la exportacion sera incompleta ante una solicitud legal y NADIE    │
 * │ RECIBIRA NINGUN ERROR". El modulo llego y no se registro, asi que la     │
 * │ exportacion entregaba ficha, notas y cobros — y se dejaba fuera los      │
 * │ datos de salud, que son precisamente los de categoria especial.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Clase dedicada que lee sus PROPIAS tablas con la transaccion de la peticion.
 * No puede usar `ProgressService`: depende de `MembersService`, y este token
 * vive en el grafo de `MembersService` — registrar algo que cierre ese circulo
 * deja a Nest colgado en el arranque sin ningun error (ADR-0010, ADR-0011).
 */
@Injectable()
export class ProgressDataContributor implements PersonalDataContributor {
  readonly seccion = 'progresoYConsentimientos';

  async aportarDatos(gymId: string, memberId: string): Promise<unknown> {
    const tx = requireTransaction();

    // Las mediciones se entregan enteras: son suyas, y entregarlas resumidas
    // seria decidir por esa persona que parte de su historial le concierne.
    const mediciones = await tx
      .select({
        fecha: bodyMetrics.measuredAt,
        pesoKg: bodyMetrics.weightKg,
        grasaPorcentaje: bodyMetrics.bodyFatPercent,
        pechoCm: bodyMetrics.chestCm,
        cinturaCm: bodyMetrics.waistCm,
        caderaCm: bodyMetrics.hipCm,
        brazoCm: bodyMetrics.armCm,
        musloCm: bodyMetrics.thighCm,
        notas: bodyMetrics.notes,
      })
      .from(bodyMetrics)
      .where(and(eq(bodyMetrics.gymId, gymId), eq(bodyMetrics.memberId, memberId)))
      .orderBy(desc(bodyMetrics.measuredAt));

    /*
     * Los consentimientos, incluidos los REVOCADOS.
     *
     * Un consentimiento retirado no se borra: es la prueba de que hubo permiso
     * mientras se trataron esos datos, y de cuando dejo de haberlo. Ocultarlo en
     * la entrega dejaria a la persona sin poder comprobar bajo que texto se
     * recogio cada medicion.
     */
    const permisos = await tx
      .select({
        finalidad: consents.purpose,
        version: consents.version,
        otorgadoEl: consents.grantedAt,
        revocadoEl: consents.revokedAt,
      })
      .from(consents)
      .where(and(eq(consents.gymId, gymId), eq(consents.memberId, memberId)))
      .orderBy(desc(consents.grantedAt));

    return { mediciones, consentimientos: permisos };
  }
}
