import { Injectable } from '@nestjs/common';
import { sql } from '@gymlab/db';
import type { GymCreatedEvent, GymCreatedHook } from '../common/gym-hooks';

/**
 * Copia el catalogo de la plataforma al gimnasio recien creado (ADR-0012).
 *
 * SIN DEPENDENCIAS INYECTADAS, como los otros implementadores de puntos de
 * extension. Aqui el motivo es el mismo de siempre: este token vive en el grafo
 * de `AuthService`, y registrar algo que dependiera de el cerraria un ciclo con
 * el que Nest se cuelga en el arranque sin dar ningun error.
 *
 * Antes esto era un metodo de `TrainingService` llamado directamente desde
 * `AuthService`. Funcionaba, y hacia que el modulo mas global del sistema
 * dependiera de uno de dominio.
 */
@Injectable()
export class GymExerciseSeeder implements GymCreatedHook {
  /**
   * `ON CONFLICT DO NOTHING` sobre (gym_id, name) lo hace idempotente: si el
   * alta se reintentara, el gimnasio no acaba con la biblioteca duplicada.
   */
  async onGymCreated(evento: GymCreatedEvent): Promise<void> {
    await evento.tx.execute(sql`
      INSERT INTO exercises (gym_id, template_id, name, muscle_group, equipment)
      SELECT ${evento.gymId}, t.id, t.name, t.muscle_group, t.equipment
      FROM exercise_templates t
      ON CONFLICT (gym_id, name) DO NOTHING
    `);
  }
}
