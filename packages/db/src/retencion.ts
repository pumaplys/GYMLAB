/**
 * LA POLITICA DE CONSERVACION DE RINDA, en un solo sitio.
 *
 * Adoptada por el responsable el 2026-09-16. Son decisiones de producto: salvo
 * donde se diga, NO las impone literalmente ninguna ley concreta — lo que
 * impone la ley es que exista un plazo y que se cumpla (RGPD art. 5.1.e).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO ES LA FUENTE DE LA VERDAD: LO ES EL SQL.                        │
 * │                                                                          │
 * │ Cada plazo vive DENTRO de su funcion `app_purge_*`, en `sql/01-rls.sql`, │
 * │ para que la aplicacion no pueda elegir cuanto borrar — si `audit_log`    │
 * │ aceptara un plazo por parametro, su caracter append-only seria un        │
 * │ adorno.                                                                  │
 * │                                                                          │
 * │ Lo que hay aqui son los MISMOS numeros, para poder documentarlos, verlos │
 * │ juntos y —sobre todo— comprobar con un test que no se han separado. Si   │
 * │ alguien cambia el SQL y no esto, el test se pone rojo y dice cual.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const RETENCION = {
  /**
   * Intentos de autenticacion, con IP y navegador. Interes legitimo en
   * proteger las cuentas.
   *
   * OJO: hasta el 2026-09-16 eran 90 dias. La politica los ALARGA a doce
   * meses. Alargar un plazo de conservacion es siempre la direccion que hay
   * que poder justificar, y la justificacion aqui es poder investigar un
   * patron de ataque que se extienda en el tiempo. Si alguna vez deja de
   * hacer falta, acortarlo es una linea.
   */
  authEventsMeses: 12,

  /**
   * Entradas al gimnasio. Es dato de negocio del gimnasio, no de RINDA, y por
   * eso es lo unico CONFIGURABLE POR GIMNASIO — `gyms.access_events_retention_months`,
   * doce meses por defecto, que es lo que permite comparar con el mismo mes
   * del ano anterior.
   */
  accessEventsMesesPorDefecto: 12,

  /** Registro de quien hizo que sobre cada ficha. Responsabilidad demostrada. */
  auditLogAnios: 3,

  /** Invitaciones RESUELTAS: aceptadas, revocadas o caducadas. Las vivas, no. */
  invitationsMeses: 12,

  /**
   * Cuotas y pagos. El plazo mas largo, y el unico que sigue un criterio
   * externo: la conservacion contable y fiscal habitual. Cada gimnasio, como
   * responsable, valora sus propias obligaciones.
   *
   * NO HAY PURGA AUTOMATICA DE PAGOS, Y ES DELIBERADO. Borrar registros
   * economicos es irreversible y puede tener consecuencias fiscales que no se
   * pueden valorar sin clientes reales. El plazo queda documentado; ejecutarlo
   * sera una decision explicita, no un efecto secundario de este fichero.
   */
  paymentsAnios: 6,

  /**
   * Datos de salud tras retirar el consentimiento: TECHO OPERATIVO.
   *
   * La purga corre a diario, asi que lo normal es menos de 24 horas. Treinta
   * dias es el maximo que se promete, y cubre el caso de que la purga no corra
   * durante un tiempo.
   */
  saludMaximoDias: 30,

  /**
   * La constancia minima de que hubo consentimiento: version, fecha de
   * aceptacion y fecha de retirada. Sin metricas, sin notas y —desde la
   * primera purga— sin IP.
   */
  constanciaConsentimientoAnios: 3,

  /**
   * Lo que puede sobrevivir dentro de una copia de seguridad.
   *
   * No es una politica aparte: es la consecuencia de las reglas del bucket
   * `gymlab-copias` (diario 8+1, semanal 29+1, predeploy y postdeploy 30+1).
   * El maximo de todas ellas es 31 dias, y por eso es el techo que se promete
   * en la politica de privacidad.
   */
  copiasMaximoDias: 31,
} as const;

/** Cuantas filas borra como mucho cada purga por pasada. */
export const LIMITE_POR_PASADA = 50_000;
