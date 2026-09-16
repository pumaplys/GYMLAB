/**
 * LA POLITICA DE CONSERVACION DE RINDA, en un solo sitio.
 *
 * Adoptada el 2026-09-16 y corregida el 2026-09-17.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ HAY DOS CLASES DE PLAZO AQUI, Y CONFUNDIRLAS ES UN ERROR JURIDICO.      │
 * │                                                                          │
 * │ 1. FINALIDADES PROPIAS DE RINDA — la cuenta, la autenticacion y la       │
 * │    seguridad. Aqui RINDA es RESPONSABLE y el plazo es decision suya.     │
 * │                                                                          │
 * │ 2. DATOS TRATADOS POR CUENTA DEL GIMNASIO — ficha, cuotas, accesos,      │
 * │    invitaciones, salud. Aqui el RESPONSABLE ES EL GIMNASIO y RINDA es    │
 * │    ENCARGADO. Estos plazos NO son una decision juridica unilateral de    │
 * │    RINDA: son la CONFIGURACION ESTANDAR DEL SERVICIO, que el gimnasio    │
 * │    acepta como INSTRUCCION DOCUMENTADA al firmar el anexo del art. 28.   │
 * │                                                                          │
 * │ La diferencia no es de redaccion. Si RINDA presentara el plazo de        │
 * │ `payments` como decision propia, se estaria atribuyendo una base         │
 * │ juridica que no tiene sobre datos de los que no responde — y el gimnasio │
 * │ perderia una facultad que es suya.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Y ESTO NO ES LA FUENTE DE LA VERDAD: LO ES EL SQL.                      │
 * │                                                                          │
 * │ Cada plazo vive DENTRO de su funcion `app_purge_*`, en `sql/01-rls.sql`, │
 * │ para que la aplicacion no pueda elegir cuanto borrar — si `audit_log`    │
 * │ aceptara un plazo por parametro, su caracter append-only seria un        │
 * │ adorno.                                                                  │
 * │                                                                          │
 * │ Lo que hay aqui son los MISMOS numeros, para documentarlos y para que un │
 * │ test compruebe que no se han separado.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Quien decide cada plazo. Va en el tipo para que no se pueda omitir al leerlo. */
export type QuienDecide =
  /** Finalidad propia de RINDA: responsable. */
  | 'rinda-responsable'
  /** Por cuenta del gimnasio: configuracion estandar aceptada como instruccion. */
  | 'gimnasio-instruccion-documentada';

export const RETENCION = {
  // ─── 1. Finalidades propias de RINDA (responsable) ───────────────────────

  /**
   * Intentos de autenticacion, con IP y navegador. Interes legitimo de RINDA
   * en proteger las cuentas: es SU finalidad, no la de ningun gimnasio — un
   * login fallido ocurre antes de saber a que gimnasio pertenece nadie.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ 90 DIAS, Y NO SE SUBE SIN UNA NECESIDAD DEMOSTRADA.                  │
   * │                                                                      │
   * │ Este plazo YA EXISTIA a 90 dias, purgandose de verdad. El 2026-09-16 │
   * │ se amplio a 12 meses por una politica escrita sobre la premisa       │
   * │ equivocada de que no habia purga ninguna. Se revierte el 2026-09-17: │
   * │ cuadruplicar la conservacion de IP y user-agent sin una necesidad    │
   * │ que ensenar es exactamente lo que el art. 5.1.e no permite.          │
   * │                                                                      │
   * │ Hay un test que se pone rojo si esto vuelve a subir. NO es un        │
   * │ numero mas: subirlo exige justificarlo antes, no despues.             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  authEventsDias: 90,
  authEventsQuienDecide: 'rinda-responsable' as QuienDecide,

  /**
   * El registro de actividad tiene DOS caras, y la documentacion las separa.
   *
   * Sirve a la seguridad del propio servicio —poder investigar un acceso
   * indebido— y a la vez registra actividad del personal de cada gimnasio
   * sobre las fichas de sus socios. No se redisena ahora; lo que no puede
   * pasar es presentarlo como una sola cosa.
   */
  auditLogAnios: 3,

  // ─── 2. Por cuenta del gimnasio (RINDA encargado) ────────────────────────
  //
  // Todos los de abajo son CONFIGURACION ESTANDAR DEL SERVICIO. El gimnasio
  // los acepta como instruccion documentada en el anexo del art. 28, y puede
  // dar otra instruccion donde la arquitectura lo permita.

  /**
   * Entradas al gimnasio.
   *
   * El unico plazo que el gimnasio YA configura por si mismo, en
   * `gyms.access_events_retention_months`. Doce meses es el valor por defecto
   * del servicio; **la configuracion del gimnasio prevalece**, porque es
   * literalmente su instruccion.
   */
  accessEventsMesesPorDefecto: 12,
  accessEventsQuienDecide: 'gimnasio-instruccion-documentada' as QuienDecide,

  /** Invitaciones RESUELTAS: aceptadas, revocadas o caducadas. Las vivas, no. */
  invitationsMeses: 12,
  invitationsQuienDecide: 'gimnasio-instruccion-documentada' as QuienDecide,

  /**
   * Cuotas y pagos: retencion estandar contractual.
   *
   * Seis anos siguen el criterio de conservacion contable y fiscal habitual,
   * pero **quien valora sus obligaciones es el gimnasio**, que es el
   * responsable. RINDA no decide cuanto debe conservar la contabilidad de
   * otro.
   *
   * NO HAY PURGA AUTOMATICA DE PAGOS, Y ES DELIBERADO. Borrar registros
   * economicos es irreversible y no se puede valorar sin clientes reales.
   */
  paymentsAnios: 6,
  paymentsQuienDecide: 'gimnasio-instruccion-documentada' as QuienDecide,

  /**
   * Datos de salud tras retirar el consentimiento: SLA TECNICO EN BASE ACTIVA.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ 24 HORAS, NO 30 DIAS.                                                │
   * │                                                                      │
   * │ La retirada encola la supresion EN EL ACTO, en la misma transaccion  │
   * │ que revoca. El trabajo diario es la red de seguridad, no el camino   │
   * │ normal: si la cola se atasca, el disparo de las 04:00 lo cubre.      │
   * │                                                                      │
   * │ Antes se prometian 30 dias con la purga diaria como unico camino.    │
   * │ Prometer un mes para borrar datos de categoria especial que se       │
   * │ pueden borrar en segundos no se sostiene.                             │
   * │                                                                      │
   * │ Hay un test que se pone rojo si esto vuelve a 30 dias.                │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  saludMaximoHoras: 24,
  saludQuienDecide: 'gimnasio-instruccion-documentada' as QuienDecide,

  /**
   * La constancia minima de que hubo consentimiento: version, fecha de
   * aceptacion y fecha de retirada. Sin metricas, sin notas y —desde la
   * primera purga— sin IP.
   */
  constanciaConsentimientoAnios: 3,

  // ─── 3. Consecuencia operativa, no politica ──────────────────────────────

  /**
   * Lo que puede sobrevivir dentro de una copia de seguridad.
   *
   * No es una politica aparte: es la consecuencia de las reglas del bucket
   * `gymlab-copias` (diario 8+1, semanal 29+1, predeploy y postdeploy 30+1).
   * El maximo de todas ellas es 31 dias.
   *
   * SI SE RESTAURA UNA COPIA que contenga datos ya suprimidos, la supresion
   * HAY QUE REAPLICARLA. La purga diaria lo hace sola para los datos de salud
   * —vuelve a encontrar el consentimiento revocado y vuelve a borrar— pero eso
   * es una propiedad que hay que comprobar tras cada restauracion, no una que
   * se pueda dar por hecha.
   */
  copiasMaximoDias: 31,
} as const;

/** Cuantas filas borra como mucho cada purga por pasada. */
export const LIMITE_POR_PASADA = 50_000;
