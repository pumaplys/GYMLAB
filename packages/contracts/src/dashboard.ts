import { z } from 'zod';

/**
 * Contratos del panel del dueno.
 *
 * El unico modulo sin tablas propias: no guarda nada, pregunta a los demas. Por
 * eso lo que hay aqui son solo formas de respuesta.
 */

export const memberStatsSchema = z.object({
  activos: z.number().int(),
  altasDelMes: z.number().int(),
  bajasDelMes: z.number().int(),
  /** Cuantos tienen cuenta creada: mide la adopcion de la app. */
  conCuenta: z.number().int(),
});
export type MemberStats = z.infer<typeof memberStatsSchema>;

export const duesStatsSchema = z.object({
  alCorriente: z.number().int(),
  /** Vencen en los proximos siete dias: la lista de a quien llamar hoy. */
  porVencer: z.number().int(),
  vencidas: z.number().int(),
  pausadas: z.number().int(),
  /** Socios activos SIN cuota. El agujero que nadie mira. */
  sinSuscripcion: z.number().int(),
  /** Cobrado este mes, en centimos y sin contar los pagos anulados. */
  ingresosDelMesCents: z.number().int(),
});
export type DuesStats = z.infer<typeof duesStatsSchema>;

export const attendanceStatsSchema = z.object({
  /** Entradas permitidas en el periodo. NO cuenta las repeticiones por red. */
  entradas: z.number().int(),
  /**
   * Socios DISTINTOS que entraron.
   *
   * No es la suma de nada: quien viene cuatro veces cuenta una. Es la diferencia
   * entre "cuanto se usa el gimnasio" y "cuanta gente lo usa".
   */
  sociosDistintos: z.number().int(),
  accesosDenegados: z.number().int(),
  /** Serie diaria para pintar la grafica, del mas antiguo al mas reciente. */
  porDia: z.array(z.object({ dia: z.string(), entradas: z.number().int() })),
});
export type AttendanceStats = z.infer<typeof attendanceStatsSchema>;

export const trainingStatsSchema = z.object({
  entrenadoresActivos: z.number().int(),
  /**
   * Socios distintos con entrenador asignado.
   *
   * `COUNT(DISTINCT member_id)` y no la suma de los contadores por entrenador:
   * un socio puede tener dos entrenadores a la vez, y sumarlos lo contaria dos
   * veces. Es un error que solo se ve cuando los numeros ya estan mal.
   */
  sociosConEntrenador: z.number().int(),
  rutinasActivas: z.number().int(),
  sociosConRutina: z.number().int(),
});
export type TrainingStats = z.infer<typeof trainingStatsSchema>;

export const dashboardSchema = z.object({
  /** Dia de referencia, en la zona del gimnasio. */
  hoy: z.string(),
  /** Cuantos dias cubre la seccion de asistencia. */
  diasDeAsistencia: z.number().int(),
  socios: memberStatsSchema,
  cuotas: duesStatsSchema,
  asistencia: attendanceStatsSchema,
  entrenamiento: trainingStatsSchema,
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const dashboardQuerySchema = z.object({
  /**
   * Ventana de asistencia. Tope de 90 dias a proposito: mas alla, la respuesta
   * deja de ser un panel y pasa a ser un informe, con otro coste de consulta.
   */
  dias: z.coerce.number().int().min(1).max(90).default(30),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
