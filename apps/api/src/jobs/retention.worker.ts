import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { authEvents, MAINTENANCE_QUEUES, sql, withoutTenant, type Database } from '@gymlab/db';
import type { PgBoss } from 'pg-boss' with { 'resolution-mode': 'import' };
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';
import { BOSS } from './jobs.tokens';

/**
 * Purga de `auth_events`.
 *
 * `auth_events` guarda IP y user-agent, que son datos personales. El RGPD exige
 * limitar el plazo de conservacion (art. 5.1.e): guardarlos indefinidamente sin
 * justificacion es incumplimiento, no descuido.
 *
 * 90 dias es el plazo que ya estaba escrito en el esquema y en ADR-0007; lo
 * unico que faltaba era ejecutarlo.
 *
 * Se apoya en el `schedule` de pg-boss, que guarda la programacion en Postgres:
 * con varias instancias, solo una ejecuta cada disparo. Un `setInterval` en el
 * proceso lo lanzaria tantas veces como instancias hubiera.
 */
/** Coincide con lo documentado en el esquema y en ADR-0007. */
const DIAS_DE_RETENCION = 90;

@Injectable()
export class RetentionWorker implements OnModuleInit {
  private readonly logger = new Logger(RetentionWorker.name);

  constructor(
    @Inject(BOSS) private readonly boss: PgBoss,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async onModuleInit(): Promise<void> {
    // En los tests no se programa nada: la purga se comprueba llamando
    // directamente a `purgar()`, sin depender de un reloj.
    if (env.NODE_ENV === 'test') return;

    // Todos los dias a las 04:00. La cola la crea `pnpm db:migrate` con el rol
    // propietario, porque crearla implica DDL.
    await this.boss.schedule(MAINTENANCE_QUEUES.retentionAuthEvents, '0 4 * * *');
    await this.boss.work(MAINTENANCE_QUEUES.retentionAuthEvents, async () => {
      const borrados = await this.purgar();
      const accesos = await this.purgarAccesos();
      this.logger.log(
        `Purgados ${borrados} eventos de autenticacion, ` +
          `${accesos.tokens} tokens de acceso y ${accesos.eventos} eventos de acceso.`,
      );
    });
  }

  /** Devuelve cuantas filas de `auth_events` se han borrado. */
  async purgar(): Promise<number> {
    const resultado = await withoutTenant(this.db, (tx) =>
      tx.execute(
        sql`DELETE FROM ${authEvents}
            WHERE created_at < now() - ${`${DIAS_DE_RETENCION} days`}::interval`,
      ),
    );

    // De paso, los contadores de intentos cuya ventana caduco hace mucho. No es
    // RGPD —no identifican a nadie por si solos— sino evitar que la tabla crezca
    // sin limite con claves que ya nadie consulta.
    await withoutTenant(this.db, (tx) =>
      tx.execute(sql`DELETE FROM auth_throttle WHERE window_start < now() - interval '1 day'`),
    );

    return resultado.rowCount ?? 0;
  }

  /**
   * Purga de tokens de acceso consumidos y eventos de acceso caducados.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LA UNICA LLAMADA DEL PRODUCTO QUE SE SALTA RLS, y conviene entender por    │
   * │ que hizo falta.                                                           │
   * │                                                                          │
   * │ La retencion de `access_events` es POR GIMNASIO, asi que la purga tiene   │
   * │ que recorrerlos todos. Con el rol de la aplicacion no puede: la politica  │
   * │ de `gyms` solo deja ver el gimnasio activo y aquellos a los que pertenece │
   * │ el usuario, y un trabajo de fondo no tiene ninguno de los dos. Ni         │
   * │ siquiera puede obtener la lista.                                          │
   * │                                                                          │
   * │ La salida comoda era conectar este worker con el rol PROPIETARIO, y se    │
   * │ descarto: meteria en el proceso que atiende peticiones una conexion capaz │
   * │ de leer y borrar cualquier gimnasio. Un fallo ahi dejaria de estar        │
   * │ acotado.                                                                  │
   * │                                                                          │
   * │ En su lugar, `app_purge_access_data()` es SECURITY DEFINER: se ejecuta    │
   * │ con los permisos de su propietario. La aplicacion no gana ningun          │
   * │ privilegio general — gana EXACTAMENTE la capacidad de borrar filas        │
   * │ caducadas, y la funcion no devuelve ni un dato personal. Esta definida y  │
   * │ comentada en `sql/01-rls.sql`, junto a las politicas, para que se revise  │
   * │ con ellas.                                                                │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  async purgarAccesos(): Promise<{ tokens: number; eventos: number }> {
    const res = await withoutTenant(this.db, (tx) =>
      tx.execute<{ tokens_borrados: string; eventos_borrados: string }>(
        sql`SELECT * FROM app_purge_access_data()`,
      ),
    );

    const fila = res.rows[0];
    return {
      tokens: Number(fila?.tokens_borrados ?? 0),
      eventos: Number(fila?.eventos_borrados ?? 0),
    };
  }
}
