/**
 * Colas de trabajos de pg-boss.
 *
 * Viven en este paquete, y no en `@gymlab/contracts`, por dos motivos:
 *
 * 1. De diseno. `contracts` son los tipos que comparten la API, el panel web y
 *    la app movil. El panel y la app nunca ven un nombre de cola: las colas no
 *    forman parte del contrato con los clientes. En cambio pg-boss guarda sus
 *    colas EN Postgres, y este paquete es el dueno de todo lo que toca la base
 *    de datos — incluida la instalacion de su esquema.
 *
 * 2. Practico, y es el que lo destapo. La instalacion de las colas
 *    (`src/deploy.ts`) se ejecuta dentro de `pnpm db:migrate`, que no pasa por
 *    Turborepo. Si importara de `@gymlab/contracts` necesitaria su `dist` ya
 *    construido, y en un checkout limpio no existe.
 *
 * Los nombres los comparten dos procesos: el script que crea las colas con el
 * rol propietario, y la API que las produce y consume. Si divergieran, los
 * trabajos se encolarian en una cola que nadie escucha.
 */
export const EMAIL_QUEUES = {
  resetPassword: 'email.reset-password',
  verifyEmail: 'email.verify-email',
  invitation: 'email.invitation',
} as const;

export type EmailQueue = (typeof EMAIL_QUEUES)[keyof typeof EMAIL_QUEUES];

/**
 * Colas de mantenimiento.
 *
 * `retention.diaria` aplica la POLITICA DE CONSERVACION entera: eventos de
 * autenticacion, accesos, registro de auditoria, invitaciones resueltas y los
 * datos de salud de quien retiro su consentimiento. No es limpieza opcional —
 * conservar sin plazo es incumplir el art. 5.1.e.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUSTITUYE A `retention.auth-events`, QUE SE QUEDA DECLARADA APOSTA.      │
 * │                                                                          │
 * │ Aquella cola ya hacia mas de lo que su nombre decia —purgaba tambien los │
 * │ accesos— y al anadirle auditoria, invitaciones y salud el nombre pasaba  │
 * │ de impreciso a enganoso. Un nombre que miente sobre lo que borra es      │
 * │ justo el que nadie revisa.                                               │
 * │                                                                          │
 * │ Se mantiene en la lista porque la fila existe en las bases ya            │
 * │ desplegadas y `createQueue` no la borra. El worker la DESPROGRAMA al     │
 * │ arrancar: si no, quedarian dos disparos diarios haciendo el mismo        │
 * │ trabajo.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const MAINTENANCE_QUEUES = {
  retentionDiaria: 'retention.diaria',
  /**
   * Supresion de datos de salud, ENCOLADA AL RETIRAR EL CONSENTIMIENTO.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EXISTE PARA QUE EL BORRADO NO ESPERE A LAS 04:00.                    │
   * │                                                                      │
   * │ La purga diaria ya borra estos datos: esta cola no anade una segunda │
   * │ implementacion, llama a la MISMA funcion. Lo que anade es el momento │
   * │ — se encola dentro de la transaccion que revoca, asi que el borrado  │
   * │ ocurre en segundos y el disparo diario queda como red de seguridad.  │
   * │                                                                      │
   * │ Sin esto, el SLA de 24 horas dependeria de la hora a la que alguien  │
   * │ pulsara «retirar»: quien lo hiciera a las 04:05 esperaria casi un    │
   * │ dia entero.                                                           │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  supresionDeSalud: 'retention.salud',
  /** @deprecated Sustituida por `retentionDiaria`. Solo para poder desprogramarla. */
  retentionAuthEvents: 'retention.auth-events',
} as const;

export const ALL_QUEUES: readonly string[] = [
  ...Object.values(EMAIL_QUEUES),
  ...Object.values(MAINTENANCE_QUEUES),
];

/**
 * Politica de cada cola, y vive aqui —junto a los nombres— porque no se puede
 * decidir sin saber CUANTO DURA EL TOKEN que lleva dentro.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS DOS PLAZOS DE pg-boss NO SON LO QUE PARECEN.                         │
 * │                                                                          │
 * │   expireInSeconds   cuanto puede estar el trabajo EN EJECUCION antes de  │
 * │                     darlo por colgado. Es un tiempo de ejecucion.        │
 * │   retentionSeconds  cuanto puede estar ESPERANDO —en `created` o         │
 * │                     `retry`— antes de borrarse. Este es el que importa.  │
 * │                                                                          │
 * │ Estaba puesto `expireInSeconds: 12h` con el comentario de que "un correo │
 * │ que lleva 12 h sin enviarse ya no sirve". Ese plazo no hacia eso: daba   │
 * │ doce horas a UNA llamada HTTP a Resend antes de considerarla colgada.    │
 * │                                                                          │
 * │ Y el que si controlaba la espera, `retentionSeconds`, estaba sin poner:  │
 * │ el valor por defecto son CATORCE DIAS. Con el proceso caido un rato, un  │
 * │ correo de recuperacion podia entregarse dias despues con un enlace que   │
 * │ murio en una hora. Quien lo abriera leeria "el enlace no es valido" sin  │
 * │ haber hecho nada mal.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La regla: **un trabajo no debe sobrevivir al token que transporta.** Es
 * preferible que caduque en la cola —y que la persona vuelva a pedirlo— a
 * entregarle un enlace muerto.
 */
export interface PoliticaDeCola {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
  expireInSeconds: number;
  retentionSeconds: number;
}

/**
 * Reintentos comunes a los correos: el fallo tipico de un proveedor es
 * transitorio —limite de peticiones o caida puntual—, asi que insistir de
 * inmediato empeora las cosas. Con 60 s y espera creciente, los cinco intentos
 * se reparten en unos 31 minutos.
 */
const REINTENTOS_DE_CORREO = {
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  // Enviar un correo es una llamada HTTP: si tarda mas de dos minutos, esta
  // colgada y lo que toca es reintentar, no esperar.
  expireInSeconds: 120,
} as const;

/**
 * 50 minutos para lo que lleva un token de una hora.
 *
 * Deja sitio a los ~31 minutos de reintentos y aun asi caduca ANTES que el
 * token, que es justo lo que se busca.
 */
const ESPERA_TOKEN_DE_UNA_HORA = 50 * 60;

export const POLITICAS: Readonly<Record<string, PoliticaDeCola>> = {
  // El token de invitacion dura 7 dias, asi que aqui la espera no es la
  // restriccion. 12 h es tiempo de sobra para superar una caida.
  [EMAIL_QUEUES.invitation]: { ...REINTENTOS_DE_CORREO, retentionSeconds: 12 * 60 * 60 },
  [EMAIL_QUEUES.resetPassword]: {
    ...REINTENTOS_DE_CORREO,
    retentionSeconds: ESPERA_TOKEN_DE_UNA_HORA,
  },
  [EMAIL_QUEUES.verifyEmail]: {
    ...REINTENTOS_DE_CORREO,
    retentionSeconds: ESPERA_TOKEN_DE_UNA_HORA,
  },
  // Purga diaria. Si un dia no corre, la del dia siguiente cubre lo mismo:
  // acumular ejecuciones pendientes no aporta nada.
  [MAINTENANCE_QUEUES.retentionDiaria]: {
    retryLimit: 2,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
    retentionSeconds: 20 * 60 * 60,
  },
  [MAINTENANCE_QUEUES.retentionAuthEvents]: {
    retryLimit: 2,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
    retentionSeconds: 20 * 60 * 60,
  },
  /*
   * Supresion de salud. Reintenta MAS veces y espera MENOS que la purga
   * diaria, porque aqui hay una promesa de 24 horas que cumplir: un fallo
   * transitorio no puede consumir el plazo entero. Y si aun asi no sale, el
   * disparo de las 04:00 vuelve a intentarlo.
   */
  [MAINTENANCE_QUEUES.supresionDeSalud]: {
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
    retentionSeconds: 12 * 60 * 60,
  },
};

/**
 * Los roles, otra vez, y a proposito.
 *
 * `@gymlab/contracts` los declara para la API, el panel y el movil. Aqui se
 * repiten por el mismo motivo que los nombres de cola viven en este paquete: el
 * paso de migracion no debe depender de haber compilado otro. Son cuatro
 * valores estables desde la Fase 1 — si algun dia dejan de coincidir, el
 * compilador no avisa, pero la plantilla cae en su texto neutro en lugar de
 * mentir.
 */
export type RolInvitado = 'owner' | 'receptionist' | 'trainer' | 'member';

export interface EmailJob {
  to: string;
  /** Token de un solo uso. Nunca se registra en logs de produccion. */
  token: string;
  url: string;
  /**
   * Para que sirve la invitacion. Solo lo lleva la cola de invitaciones.
   *
   * Sin este dato, el correo tenia que hablarle igual a todo el mundo — y
   * hablaba como si el destinatario fuese un socio: le prometia rutinas y
   * progreso en el movil a quien iba a atender el mostrador.
   */
  role?: RolInvitado;
}
