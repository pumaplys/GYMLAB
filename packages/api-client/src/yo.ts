import { z } from 'zod';
import {
  accessTokenSchema,
  assignedMemberSchema,
  ownAccessEventListSchema,
  ownPaymentListSchema,
  assignedRoutineSchema,
  bodyMetricSchema,
  duesStatusSchema,
  healthConsentStatusSchema,
  memberSchema,
  trainerSchema,
  type AccessTokenResponse,
  type AssignedMember,
  type OwnAccessEventList,
  type OwnPaymentList,
  type AssignedRoutine,
  type BodyMetric,
  type DuesStatus,
  type HealthConsentStatus,
  type Member,
  type Trainer,
} from '@gymlab/contracts';
import type { Http, RequestOptions } from './http';

/**
 * Lo que cada rol puede pedir SOBRE SI MISMO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN `gymId` EN LA RUTA, Y ESA ES LA GRACIA.                              │
 * │                                                                          │
 * │ El resto del cliente lleva `/gyms/:gymId/...` porque asi es la API. Estas │
 * │ no: el servidor resuelve la ficha por el `user_id` de la sesion y el      │
 * │ gimnasio por el activo de la sesion. No hay ningun identificador que      │
 * │ escribir, y por tanto ninguno con el que probar suerte.                   │
 * │                                                                          │
 * │ Es la razon por la que el area de socio no necesita que el frontend le    │
 * │ pase nada: su contexto ES su sesion.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * DE MOMENTO SOLO EL PERFIL DE CADA AREA. Las rutinas, la cuota, el progreso y
 * el QR se anaden cuando llegue la pantalla que los usa: un metodo sin
 * consumidor no se ejecuta nunca y, por tanto, tampoco se sabe si funciona.
 */
export interface YoApi {
  /**
   * El perfil del entrenador que ha iniciado sesion.
   *
   * 403 si el rol del gimnasio activo no es `trainer` — el servidor lo impone
   * con `@Roles('trainer')`, no depende de que el frontend no lo llame.
   */
  perfilDeEntrenador(options?: RequestOptions): Promise<Trainer>;

  /**
   * Los socios que el entrenador tiene asignados en el gimnasio activo.
   *
   * SIN PAGINACION NI BUSQUEDA EN SERVIDOR, y no es un olvido del cliente: el
   * endpoint no las ofrece. Un entrenador lleva una cartera de personas, no un
   * censo, asi que la lista entera cabe en una respuesta y filtrar por nombre
   * se hace en pantalla sin pedir nada.
   */
  misSocios(options?: RequestOptions): Promise<AssignedMember[]>;

  /**
   * Uno de mis socios asignados.
   *
   * **404 si no es mio**, no 403 — y esa diferencia es del servidor, no de
   * aqui: confirmar que la ficha existe ya seria filtrar informacion sobre
   * socios ajenos.
   */
  miSocio(memberId: string, options?: RequestOptions): Promise<AssignedMember>;

  /**
   * La ficha del socio que ha iniciado sesion.
   *
   * 404 si esa cuenta no tiene ficha en el gimnasio activo, que es un caso
   * real: alguien puede ser recepcion en un gimnasio y no ser socio de el.
   */
  fichaDeSocio(options?: RequestOptions): Promise<Member>;

  /**
   * Mi consentimiento de datos de salud, con EL TEXTO que tendria que leer.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ NINGUNA DE LAS TRES LLEVA IDENTIFICADOR, Y ESA ES LA SEGURIDAD.         │
   * │                                                                          │
   * │ El servidor resuelve la ficha por el `user_id` de la sesion. No hay      │
   * │ parametro que manipular para hablar del consentimiento de otro: no es    │
   * │ que se compruebe, es que no existe la via.                               │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * `document` es `null` cuando el gimnasio no tiene texto publicado: entonces
   * no hay nada que aceptar, y el servidor tampoco lo permitiria.
   */
  consentimientoDeSalud(options?: RequestOptions): Promise<HealthConsentStatus>;

  /**
   * Mi cuota en el gimnasio activo.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ EL ESTADO LO CALCULA EL SERVIDOR, Y AQUI NO SE RECALCULA NADA.           │
   * │                                                                          │
   * │ `estado` ya viene resuelto —AL_CORRIENTE, POR_VENCER, EN_GRACIA,         │
   * │ VENCIDA, PAUSADA o SIN_SUSCRIPCION— teniendo en cuenta el huso horario   │
   * │ del gimnasio y sus dias de cortesia, que son configurables. Deducirlo    │
   * │ en pantalla a partir de `hasta` daria otro resultado, y el que estaria   │
   * │ mal seria el de la pantalla.                                            │
   * │                                                                          │
   * │ NO TRAE IMPORTE: `DuesStatus` no lo lleva. Lo que cuesta el plan vive en │
   * │ `plans`, que es del personal.                                            │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  miCuota(options?: RequestOptions): Promise<DuesStatus>;

  /**
   * Las rutinas que sigo AHORA MISMO en el gimnasio activo.
   *
   * Solo las vigentes: el servidor filtra por `ended_at IS NULL`. Pueden ser
   * VARIAS a la vez —fuerza y movilidad— y no hay ninguna marcada como
   * principal, porque el modelo no tiene ese concepto.
   *
   * Cada una viene entera, con sus ejercicios dentro y en orden.
   */
  misRutinas(options?: RequestOptions): Promise<AssignedRoutine[]>;

  /**
   * Mis mediciones, de la mas reciente a la mas antigua.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LEER NO EXIGE CONSENTIMIENTO VIGENTE.                                    │
   * │                                                                          │
   * │ Si retiro mi autorizacion, dejan de poder registrarme mediciones nuevas  │
   * │ pero sigo viendo las que ya existen — que es justo lo que necesito para  │
   * │ ejercer el derecho de acceso o pedir que las borren.                     │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  miProgreso(options?: RequestOptions): Promise<BodyMetric[]>;

  /**
   * Genera mi codigo de acceso para el gimnasio activo.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ DURA UN MINUTO Y SE USA UNA VEZ.                                        │
   * │                                                                          │
   * │ El servidor lo firma con una clave derivada del gimnasio, asi que un     │
   * │ codigo de otro gimnasio no valida por construccion. Al escanearlo se     │
   * │ consume el `jti`: presentarlo dos veces no abre dos veces.               │
   * │                                                                          │
   * │ NO COMPRUEBA LA CUOTA. Generar siempre funciona si eres socio; quien     │
   * │ decide si pasas es el escaner de la puerta, que mira el estado en ese    │
   * │ momento. Por eso esto no es la via para saber si puedes entrar.          │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Es `POST` y no `GET` porque crea algo: cada llamada devuelve un codigo
   * nuevo.
   */
  /**
   * Mi historial de pagos en el gimnasio activo. Paginado.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ NO TRAE `note` NI QUIEN LO COBRO.                                       │
   * │                                                                          │
   * │ La nota es del mostrador y quien cobro es un empleado: son datos de      │
   * │ otros, no del socio. Lo que si viene son los ANULADOS, con su motivo,    │
   * │ porque anular retira el periodo que ese pago concedio y es justo lo que  │
   * │ explica por que una cuota volvio atras.                                  │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Los pagos de una ficha borrada quedan con `member_id` a nulo y no vuelven
   * por aqui: eso desharia el borrado.
   */
  misPagos(
    pagina: { page: number; pageSize: number },
    options?: RequestOptions,
  ): Promise<OwnPaymentList>;

  /**
   * Mi historial de entradas. Paginado, de la mas reciente a la mas antigua.
   *
   * Solo lo que la persona necesita: si paso o no, por que, cuando, y si fue un
   * reintento del mismo escaner. Ni su nombre —ya sabe quien es— ni ningun
   * identificador tecnico.
   *
   * Los intentos con token invalido NO estan: se registran sin socio, asi que
   * no pertenecen al historial de nadie.
   */
  misAccesos(
    pagina: { page: number; pageSize: number },
    options?: RequestOptions,
  ): Promise<OwnAccessEventList>;

  tokenDeAcceso(options?: RequestOptions): Promise<AccessTokenResponse>;

  /**
   * Acepto la version vigente. Idempotente: aceptar dos veces no duplica nada.
   *
   * La version se manda para que el servidor compruebe que es la que hay ahora:
   * asi una pantalla vieja no puede registrar la aceptacion de un texto que ya
   * no esta en uso.
   */
  aceptarConsentimientoDeSalud(
    version: string,
    options?: RequestOptions,
  ): Promise<HealthConsentStatus>;

  /**
   * Retiro mi consentimiento. Es un derecho: ni motivo ni permiso del gimnasio.
   *
   * A partir de aqui no se registran mediciones nuevas. Las que ya existen se
   * conservan —el gimnasio tiene que poder atender una peticion de acceso o de
   * supresion— y no se borran solas.
   */
  revocarConsentimientoDeSalud(options?: RequestOptions): Promise<HealthConsentStatus>;
}

export function createYoApi(http: Http): YoApi {
  return {
    perfilDeEntrenador: (options) =>
      http({ method: 'GET', path: '/me/trainer', schema: trainerSchema, ...options }),

    misSocios: (options) =>
      http({
        method: 'GET',
        path: '/me/trainer/members',
        schema: z.array(assignedMemberSchema),
        ...options,
      }),

    miSocio: (memberId, options) =>
      http({
        method: 'GET',
        path: `/me/trainer/members/${encodeURIComponent(memberId)}`,
        schema: assignedMemberSchema,
        ...options,
      }),

    fichaDeSocio: (options) =>
      http({ method: 'GET', path: '/me/member-profile', schema: memberSchema, ...options }),

    misRutinas: (options) =>
      http({
        method: 'GET',
        path: '/me/routines',
        schema: z.array(assignedRoutineSchema),
        ...options,
      }),

    miProgreso: (options) =>
      http({
        method: 'GET',
        path: '/me/progress',
        schema: z.array(bodyMetricSchema),
        ...options,
      }),

    misPagos: (pagina, options) =>
      http({
        method: 'GET',
        path: `/me/payments?page=${pagina.page}&pageSize=${pagina.pageSize}`,
        schema: ownPaymentListSchema,
        ...options,
      }),

    misAccesos: (pagina, options) =>
      http({
        method: 'GET',
        path: `/me/access/events?page=${pagina.page}&pageSize=${pagina.pageSize}`,
        schema: ownAccessEventListSchema,
        ...options,
      }),

    tokenDeAcceso: (options) =>
      http({ method: 'POST', path: '/me/access/token', schema: accessTokenSchema, ...options }),

    miCuota: (options) =>
      http({ method: 'GET', path: '/me/dues', schema: duesStatusSchema, ...options }),

    consentimientoDeSalud: (options) =>
      http({
        method: 'GET',
        path: '/me/health-consent',
        schema: healthConsentStatusSchema,
        ...options,
      }),

    aceptarConsentimientoDeSalud: (version, options) =>
      http({
        method: 'POST',
        path: '/me/health-consent',
        body: { version },
        schema: healthConsentStatusSchema,
        ...options,
      }),

    revocarConsentimientoDeSalud: (options) =>
      http({
        method: 'DELETE',
        path: '/me/health-consent',
        schema: healthConsentStatusSchema,
        ...options,
      }),
  };
}
