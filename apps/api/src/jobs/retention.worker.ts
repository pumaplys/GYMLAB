import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  authEvents,
  LIMITE_POR_PASADA,
  MAINTENANCE_QUEUES,
  RETENCION,
  sql,
  withoutTenant,
  type Database,
} from '@gymlab/db';
import type { PgBoss } from 'pg-boss' with { 'resolution-mode': 'import' };
import { env } from '../config/env';
import { DATABASE } from '../database/database.module';
import { BOSS } from './jobs.tokens';

/**
 * La POLITICA DE CONSERVACION, ejecutandose.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA POLITICA QUE NADIE EJECUTA ES UN PARRAFO, NO UNA POLITICA.           │
 * │                                                                          │
 * │ Escribir «los eventos se guardan doce meses» en la politica de           │
 * │ privacidad y no borrarlos nunca es peor que no escribirlo: se ha         │
 * │ prometido algo que no ocurre, y ademas por escrito.                      │
 * │                                                                          │
 * │ Cada plazo vive en su funcion SQL, no aqui. Este worker decide CUANDO se │
 * │ ejecuta y CUANTO se hace por pasada; nunca CUANTO se conserva.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se apoya en el `schedule` de pg-boss, que guarda la programacion en Postgres:
 * con varias instancias, solo una ejecuta cada disparo. Un `setInterval` en el
 * proceso lo lanzaria tantas veces como instancias hubiera.
 */
@Injectable()
export class RetentionWorker implements OnModuleInit {
  private readonly logger = new Logger(RetentionWorker.name);

  constructor(
    @Inject(BOSS) private readonly boss: PgBoss,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async onModuleInit(): Promise<void> {
    // En los tests no se programa nada: las purgas se comprueban llamando
    // directamente a `purgarTodo()`, sin depender de un reloj.
    if (env.NODE_ENV === 'test') return;

    /*
     * La cola vieja, desprogramada. En una base ya desplegada sigue existiendo
     * su horario, y sin esto habria dos disparos diarios: el nuevo, completo, y
     * el viejo, que ya no tiene quien lo atienda y se quedaria acumulando
     * trabajos en `created` hasta caducar. Es idempotente y no falla si no
     * habia nada programado.
     */
    try {
      await this.boss.unschedule(MAINTENANCE_QUEUES.retentionAuthEvents);
    } catch {
      // No estaba programada. Es el caso normal en una base nueva.
    }

    /*
     * La supresion de salud, que NO espera al reloj.
     *
     * La encola la retirada del consentimiento dentro de su propia
     * transaccion, asi que este consumidor la ve en segundos. Llama a la MISMA
     * funcion que la purga diaria: no hay dos implementaciones del borrado de
     * datos de salud, hay dos disparadores de una.
     */
    await this.boss.work(MAINTENANCE_QUEUES.supresionDeSalud, async (trabajos) => {
      const salud = await this.purgarDatosDeSalud();
      const referencia = trabajos
        .map((t) => (t.data as { gymId?: string })?.gymId)
        .filter(Boolean)
        .join(', ');
      this.logger.log(
        `Supresion de salud tras retirada${referencia ? ` (gimnasios ${referencia})` : ''}: ` +
          `${salud.mediciones} mediciones, ${salud.constanciasMinimizadas} constancias minimizadas.`,
      );
      return salud;
    });

    // Todos los dias a las 04:00. La cola la crea `pnpm db:migrate` con el rol
    // propietario, porque crearla implica DDL.
    await this.boss.schedule(MAINTENANCE_QUEUES.retentionDiaria, '0 4 * * *');
    await this.boss.work(MAINTENANCE_QUEUES.retentionDiaria, async () => {
      const r = await this.purgarTodo();
      this.logger.log(
        `Retencion aplicada: ${r.authEvents} eventos de autenticacion, ` +
          `${r.accessTokens} tokens y ${r.accessEvents} accesos, ` +
          `${r.auditLog} lineas de auditoria, ${r.invitations} invitaciones, ` +
          `${r.mediciones} mediciones de salud, ` +
          `${r.constanciasMinimizadas} constancias minimizadas y ` +
          `${r.constanciasBorradas} constancias caducadas.`,
      );
      /*
       * Se devuelve para que quede como SALIDA del trabajo en pg-boss. Ese es
       * el rastro de que la politica se aplico y cuanto borro — sin un solo
       * dato personal, que es justo lo que debe tener un registro de purgas.
       */
      return r;
    });
  }

  /**
   * Aplica TODA la politica. Idempotente: si no hay nada caducado, borra cero.
   *
   * Se ejecuta como una sola pasada y no en transacciones separadas por tabla:
   * son borrados independientes entre si, y que uno falle no debe impedir los
   * demas — por eso tampoco se envuelven en una transaccion comun.
   */
  async purgarTodo(): Promise<ResultadoDeRetencion> {
    const authEventsBorrados = await this.purgar();
    const accesos = await this.purgarAccesos();
    const auditLog = await this.purgarAuditoria();
    const invitations = await this.purgarInvitaciones();
    const salud = await this.purgarDatosDeSalud();

    return {
      authEvents: authEventsBorrados,
      accessTokens: accesos.tokens,
      accessEvents: accesos.eventos,
      auditLog,
      invitations,
      mediciones: salud.mediciones,
      constanciasMinimizadas: salud.constanciasMinimizadas,
      constanciasBorradas: salud.constanciasBorradas,
    };
  }

  /**
   * `auth_events`, NOVENTA DIAS.
   *
   * Es la unica purga de finalidad PROPIA de RINDA —seguridad de las cuentas,
   * no encargo de ningun gimnasio— y la unica que hace la aplicacion por si
   * misma: `auth_events` no tiene RLS, porque un intento de login fallido no
   * tiene gimnasio todavia, y el rol de la aplicacion si puede borrar ahi. Las
   * demas recorren todos los gimnasios y van por funcion SECURITY DEFINER.
   */
  async purgar(): Promise<number> {
    const resultado = await withoutTenant(this.db, (tx) =>
      tx.execute(
        sql`DELETE FROM ${authEvents}
             WHERE ctid IN (
               SELECT ctid FROM ${authEvents}
                WHERE created_at < now() - ${`${RETENCION.authEventsDias} days`}::interval
                LIMIT ${LIMITE_POR_PASADA}
             )`,
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
   * │ LAS CUATRO LLAMADAS DE ESTE FICHERO SE SALTAN RLS, y conviene entender    │
   * │ por que hizo falta.                                                      │
   * │                                                                          │
   * │ Una purga recorre TODOS los gimnasios. Con el rol de la aplicacion no    │
   * │ puede: la politica de `gyms` solo deja ver el gimnasio activo y aquellos │
   * │ a los que pertenece el usuario, y un trabajo de fondo no tiene ninguno.  │
   * │ Ni siquiera puede obtener la lista. Y sobre `audit_log` ademas tiene el  │
   * │ DELETE retirado, que es lo que la hace append-only.                      │
   * │                                                                          │
   * │ La salida comoda era conectar este worker con el rol PROPIETARIO, y se   │
   * │ descarto: meteria en el proceso que atiende peticiones una conexion      │
   * │ capaz de leer y borrar cualquier gimnasio. Un fallo ahi dejaria de estar │
   * │ acotado.                                                                 │
   * │                                                                          │
   * │ En su lugar, cada `app_purge_*` es SECURITY DEFINER: se ejecuta con los  │
   * │ permisos de su propietario. La aplicacion no gana ningun privilegio      │
   * │ general — gana EXACTAMENTE la capacidad de borrar filas caducadas, y     │
   * │ ninguna de esas funciones devuelve un solo dato personal. Estan          │
   * │ definidas y comentadas en `sql/01-rls.sql`, junto a las politicas, para  │
   * │ que se revisen con ellas.                                                │
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

  /** `audit_log`, tres anos. */
  async purgarAuditoria(): Promise<number> {
    const res = await withoutTenant(this.db, (tx) =>
      tx.execute<{ app_purge_audit_log: string }>(
        sql`SELECT app_purge_audit_log(${LIMITE_POR_PASADA})`,
      ),
    );
    return Number(res.rows[0]?.app_purge_audit_log ?? 0);
  }

  /** Invitaciones resueltas, doce meses. Las pendientes no se tocan. */
  async purgarInvitaciones(): Promise<number> {
    const res = await withoutTenant(this.db, (tx) =>
      tx.execute<{ app_purge_invitations: string }>(
        sql`SELECT app_purge_invitations(${LIMITE_POR_PASADA})`,
      ),
    );
    return Number(res.rows[0]?.app_purge_invitations ?? 0);
  }

  /**
   * Datos de salud de quien retiro el consentimiento.
   *
   * Lo llaman DOS disparadores: la cola `retention.salud`, que encola la propia
   * retirada dentro de su transaccion —de ahi que lo normal sea segundos—, y el
   * trabajo diario, que es la red de seguridad. La promesa publica es un SLA de
   * 24 horas en base activa.
   */
  async purgarDatosDeSalud(): Promise<{
    mediciones: number;
    constanciasMinimizadas: number;
    constanciasBorradas: number;
  }> {
    const res = await withoutTenant(this.db, (tx) =>
      tx.execute<{
        mediciones: string;
        constancias_minimizadas: string;
        constancias_borradas: string;
      }>(sql`SELECT * FROM app_purge_health_data(${LIMITE_POR_PASADA})`),
    );

    const fila = res.rows[0];
    return {
      mediciones: Number(fila?.mediciones ?? 0),
      constanciasMinimizadas: Number(fila?.constancias_minimizadas ?? 0),
      constanciasBorradas: Number(fila?.constancias_borradas ?? 0),
    };
  }
}

export interface ResultadoDeRetencion {
  authEvents: number;
  accessTokens: number;
  accessEvents: number;
  auditLog: number;
  invitations: number;
  mediciones: number;
  constanciasMinimizadas: number;
  constanciasBorradas: number;
}
