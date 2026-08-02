import { Injectable } from '@nestjs/common';
import type { Dashboard } from '@gymlab/contracts';
import { AccessService } from '../access/access.service';
import { BillingService } from '../billing/billing.service';
import { MembersService } from '../members/members.service';
import { TrainersService } from '../trainers/trainers.service';
import { TrainingService } from '../training/training.service';

/**
 * El panel del dueno.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL UNICO MODULO SIN TABLAS PROPIAS. No guarda nada: pregunta.             │
 * │                                                                          │
 * │ Cada metrica la calcula el modulo DUENO de esos datos y la expone en su   │
 * │ propio `stats()`. Aqui solo se componen. La alternativa —una consulta     │
 * │ grande con JOINs a cinco modulos— seria mas corta de escribir y romperia  │
 * │ la frontera que sostiene todo lo demas (ADR-0006): el dia que cambie una  │
 * │ tabla, el panel se entera por un fallo en produccion.                     │
 * │                                                                          │
 * │ Y la direccion es solo hacia fuera: nadie depende del panel, asi que no   │
 * │ hay ciclo posible ni punto de extension que cablear.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly members: MembersService,
    private readonly billing: BillingService,
    private readonly access: AccessService,
    private readonly trainers: TrainersService,
    private readonly training: TrainingService,
  ) {}

  async resumen(gymId: string, dias: number): Promise<Dashboard> {
    // EN SERIE, no con `Promise.all`: las cinco leen de la MISMA transaccion de
    // la peticion, y una conexion de node-postgres no admite sentencias
    // simultaneas. Es la regla que ya nos mordio en el modulo de rutinas.
    const hoy = await this.billing.hoyDelGimnasio(gymId);
    const socios = await this.members.stats(gymId, hoy);
    const cuotas = await this.billing.stats(gymId);
    const asistencia = await this.access.stats(gymId, dias);
    const deEntrenadores = await this.trainers.stats(gymId);
    const deRutinas = await this.training.stats(gymId);

    return {
      hoy,
      diasDeAsistencia: dias,
      socios,
      cuotas,
      asistencia,
      entrenamiento: { ...deEntrenadores, ...deRutinas },
    };
  }
}
