import { Injectable, NotFoundException } from '@nestjs/common';
import { auditLog, eq, gyms } from '@gymlab/db';
import type { GymSettings, UpdateGymSettingsInput } from '@gymlab/contracts';
import { requireRequestContext, requireTransaction } from '../common/request-context';

/**
 * Ajustes por gimnasio.
 *
 * Pequeno a proposito. Existe porque dos decisiones de negocio —los dias de
 * cortesia de las cuotas y los meses de retencion de los accesos— acabaron como
 * columnas que nadie podia cambiar sin una migracion. Un ajuste que exige
 * desplegar no es un ajuste.
 *
 * Vive junto a `access` y no en un modulo propio porque hoy son dos campos. El
 * dia que crezca —nombre, zona horaria, slug— se saca a `organization`, que es
 * donde le corresponde segun la arquitectura.
 */
@Injectable()
export class GymSettingsService {
  async get(gymId: string): Promise<GymSettings> {
    const tx = requireTransaction();
    const [fila] = await tx.select().from(gyms).where(eq(gyms.id, gymId)).limit(1);

    if (!fila) throw new NotFoundException('Gimnasio no encontrado.');

    return {
      gymId: fila.id,
      name: fila.name,
      timezone: fila.timezone,
      graceDays: fila.graceDays,
      accessEventsRetentionMonths: fila.accessEventsRetentionMonths,
    };
  }

  /**
   * Cambia los ajustes, y lo deja auditado.
   *
   * BAJAR LA RETENCION ES DESTRUCTIVO: la siguiente purga se lleva lo que quede
   * fuera del nuevo plazo, y esos accesos no vuelven. Por eso se registra el
   * valor —no solo que hubo un cambio— y por eso el endpoint es solo del dueno.
   */
  async update(gymId: string, input: UpdateGymSettingsInput): Promise<GymSettings> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    await this.get(gymId);

    await tx
      .update(gyms)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(gyms.id, gymId));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'gym.settings_updated',
      entityType: 'gym',
      entityId: gymId,
      metadata: { ...input },
    });

    return this.get(gymId);
  }
}
