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
 * `retention.auth-events` purga los eventos de autenticacion pasados 90 dias.
 * No es limpieza opcional: `auth_events` guarda IP y user-agent, y el RGPD
 * exige limitar el plazo de conservacion (art. 5.1.e).
 */
export const MAINTENANCE_QUEUES = {
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
  [MAINTENANCE_QUEUES.retentionAuthEvents]: {
    retryLimit: 2,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
    retentionSeconds: 20 * 60 * 60,
  },
};

export interface EmailJob {
  to: string;
  /** Token de un solo uso. Nunca se registra en logs de produccion. */
  token: string;
  url: string;
}
