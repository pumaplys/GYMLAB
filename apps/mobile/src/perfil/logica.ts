/**
 * Las decisiones de Perfil, Pagos, Accesos y Privacidad. Sin React y sin red.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL MODELO REAL, AUDITADO EN CONTRATO, API, BASE DE DATOS Y FIXTURE.     │
 * │                                                                          │
 * │ FICHA (`Member`)                                                         │
 * │   id, memberNumber, firstName, lastName, email|null, phone|null,         │
 * │   birthDate|null, status, joinedAt, leftAt|null, hasAccount              │
 * │                                                                          │
 * │ PAGO (`OwnPayment`)                                                      │
 * │   id, concept, amountCents, currency, method, paidOn,                    │
 * │   voidedAt|null, voidReason|null                                         │
 * │                                                                          │
 * │ ACCESO (`OwnAccessEvent`)                                                │
 * │   decision, reason, isRetry, occurredAt                                  │
 * │                                                                          │
 * │ CONSENTIMIENTO (`HealthConsentStatus`)                                   │
 * │   currentVersion|null, accepted, acceptedAt|null, document|null          │
 * │                                                                          │
 * │ NO EXISTE, y por tanto no se dibuja: editar la ficha, cambiar la         │
 * │ contraseña, foto, tarjeta guardada, descargar factura, pagar desde el    │
 * │ movil, cambiar de plan, borrar la cuenta, notificaciones, preferencias   │
 * │ ni biometria. Ningun endpoint los ofrece.                                │
 * │                                                                          │
 * │ Y en ACCESOS no hay PUERTA: el contrato no trae origen ni dispositivo,   │
 * │ asi que no se puede decir "entraste por la principal".                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type {
  HealthConsentStatus,
  Member,
  OwnAccessEvent,
  OwnPayment,
} from '@gymlab/contracts';

// --- La identidad --------------------------------------------------------

export interface Identidad {
  nombre: string;
  /** "Socio n.º 128". El numero es por gimnasio, no global. */
  numero: string;
  /** La letra que se pinta en el circulo. Nunca una foto: no existe. */
  inicial: string;
}

export function identidadDe(ficha: Member): Identidad {
  const nombre = `${ficha.firstName} ${ficha.lastName}`.trim();
  return {
    nombre,
    numero: `Socio n.º ${ficha.memberNumber}`,
    inicial: (ficha.firstName.trim()[0] ?? '?').toUpperCase(),
  };
}

// --- Los pagos -----------------------------------------------------------

/**
 * Un importe, escrito en español.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `amountCents` SON CENTIMOS ENTEROS. NO ES UN FLOAT DE EUROS.            │
 * │                                                                          │
 * │ La columna es `integer` y el contrato lo declara `z.number().int()`:     │
 * │ 3500 son treinta y cinco euros, no tres mil quinientos. Pintarlo tal     │
 * │ cual multiplicaria cada cuota por cien.                                  │
 * │                                                                          │
 * │ Se divide entre 100 con aritmetica de enteros —parte entera y resto—     │
 * │ para no meter coma flotante en un importe. Y se escribe con COMA         │
 * │ decimal y el simbolo detras, que es como se escribe en español.          │
 * │                                                                          │
 * │ `currency` es texto libre con `EUR` por defecto: si algun dia llega otra │
 * │ cosa se enseña el codigo tal cual en lugar de inventar un simbolo.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const SIMBOLOS: Record<string, string> = { EUR: '€' };

export function importe(amountCents: number, currency: string): string {
  const negativo = amountCents < 0;
  const total = Math.abs(Math.trunc(amountCents));
  const euros = Math.floor(total / 100);
  const centimos = total % 100;

  const simbolo = SIMBOLOS[currency.toUpperCase()] ?? currency;
  const cuerpo = `${miles(euros)},${String(centimos).padStart(2, '0')}`;
  return `${negativo ? '−' : ''}${cuerpo} ${simbolo}`;
}

/** Separador de millares: 1.234,50 €. El punto, como en español. */
function miles(entero: number): string {
  const texto = String(entero);
  let salida = '';
  for (let i = 0; i < texto.length; i++) {
    const desdeElFinal = texto.length - i;
    salida += texto[i];
    if (desdeElFinal > 1 && desdeElFinal % 3 === 1) salida += '.';
  }
  return salida;
}

/** Lo mismo, dicho entero para un lector de pantalla. */
export function lecturaDeImporte(amountCents: number, currency: string): string {
  const total = Math.abs(Math.trunc(amountCents));
  const euros = Math.floor(total / 100);
  const centimos = total % 100;
  const moneda = currency.toUpperCase() === 'EUR' ? 'euros' : currency;
  if (centimos === 0) return `${euros} ${moneda}`;
  return `${euros} con ${String(centimos).padStart(2, '0')} ${moneda}`;
}

/** Los tres conceptos del contrato, dichos como los diria el mostrador. */
const CONCEPTOS: Record<OwnPayment['concept'], string> = {
  subscription: 'Cuota',
  enrolment: 'Matrícula',
  other: 'Otro concepto',
};

export function conceptoDePago(pago: OwnPayment): string {
  return CONCEPTOS[pago.concept];
}

/** Los cuatro metodos del contrato. */
const METODOS: Record<OwnPayment['method'], string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro método',
};

export function metodoDePago(pago: OwnPayment): string {
  return METODOS[pago.method];
}

/**
 * Si el pago sigue en pie.
 *
 * Un pago anulado NO se esconde: anular retira el periodo que ese pago
 * concedio, y es justo lo que explica por que una cuota volvio atras. El
 * motivo viene del mostrador y se enseña tal cual.
 */
export type EstadoDePago = { anulado: false } | { anulado: true; iso: string; motivo: string | null };

export function estadoDePago(pago: OwnPayment): EstadoDePago {
  if (!pago.voidedAt) return { anulado: false };
  return { anulado: true, iso: pago.voidedAt, motivo: pago.voidReason };
}

// --- Los accesos ---------------------------------------------------------

/**
 * Que paso en un acceso.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO HAY PUERTA NI DISPOSITIVO. NO SE INVENTAN.                           │
 * │                                                                          │
 * │ `OwnAccessEvent` son cuatro campos: `decision`, `reason`, `isRetry` y    │
 * │ `occurredAt`. Ni origen, ni torno, ni sede. "Entraste por la puerta      │
 * │ principal" seria una frase inventada.                                    │
 * │                                                                          │
 * │ Y los motivos tecnicos —`BAD_SIGNATURE`, `TOKEN_EXPIRED`, `UNKNOWN_      │
 * │ MEMBER`— no llegan aqui: se registran SIN socio, asi que no pertenecen   │
 * │ al historial de nadie. Se traducen igual, por si el contrato cambia.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const MOTIVOS: Record<OwnAccessEvent['reason'], string> = {
  OK: 'Acceso correcto',
  DUES_WARN: 'Cuota a punto de vencer',
  DUES_EXPIRED: 'Cuota vencida',
  NO_SUBSCRIPTION: 'Sin suscripción activa',
  MEMBER_INACTIVE: 'Ficha de socio inactiva',
  TOKEN_REUSED: 'Código ya utilizado',
  TOKEN_EXPIRED: 'Código caducado',
  BAD_SIGNATURE: 'Código no válido',
  UNKNOWN_MEMBER: 'Socio no reconocido',
};

/** El tono del vocabulario de `Etiqueta`, que NO es el de `Aviso`. */
export type TonoDeAcceso = 'exito' | 'aviso' | 'peligro';

export interface LecturaDeAcceso {
  /** La palabra, que funciona sin ver el color. */
  titulo: string;
  detalle: string;
  tono: TonoDeAcceso;
  /** Un reintento del escaner, no una entrada nueva. */
  esReintento: boolean;
}

export function lecturaDeAcceso(evento: OwnAccessEvent): LecturaDeAcceso {
  const titulo =
    evento.decision === 'ALLOW' ? 'Entrada' : evento.decision === 'WARN' ? 'Entrada con aviso' : 'Entrada denegada';
  const tono: TonoDeAcceso =
    evento.decision === 'ALLOW' ? 'exito' : evento.decision === 'WARN' ? 'aviso' : 'peligro';

  return {
    titulo,
    detalle: MOTIVOS[evento.reason],
    tono,
    esReintento: evento.isRetry,
  };
}

// --- La privacidad -------------------------------------------------------

/**
 * En que situacion esta el consentimiento de datos de salud.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS CUATRO ESTADOS SALEN DE CRUZAR DOS CAMPOS, Y ESTAN EN EL CONTRATO.  │
 * │                                                                          │
 * │   document === null          -> el gimnasio no ha publicado texto legal  │
 * │   document && !accepted      -> hay texto y no lo ha aceptado            │
 * │   document && accepted       -> consentimiento vigente                   │
 * │                                                                          │
 * │ Sin documento NO se ofrece aceptar: un consentimiento del articulo 9     │
 * │ tiene que ser INFORMADO, y aceptar algo que no se puede leer no es       │
 * │ consentimiento. Ademas el servidor lo rechazaria.                        │
 * │                                                                          │
 * │ En el fixture de desarrollo el gimnasio de la socia NO tiene documento:  │
 * │ ese es el estado que de verdad se va a ver.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type SituacionDePrivacidad =
  | { tipo: 'sinTexto' }
  | { tipo: 'pendiente'; version: string; titulo: string; texto: string; responsable: string }
  | {
      tipo: 'vigente';
      version: string;
      titulo: string;
      texto: string;
      responsable: string;
      /** Cuando lo acepto. Instante. */
      aceptadoEn: string | null;
    };

export function situacionDePrivacidad(estado: HealthConsentStatus): SituacionDePrivacidad {
  const doc = estado.document;
  if (!doc) return { tipo: 'sinTexto' };

  const comun = {
    version: doc.version,
    titulo: doc.title,
    texto: doc.body,
    responsable: doc.controller,
  };

  if (!estado.accepted) return { tipo: 'pendiente', ...comun };
  return { tipo: 'vigente', ...comun, aceptadoEn: estado.acceptedAt };
}

/** Que se puede hacer, y solo lo que la API ofrece de verdad. */
export function accionesDePrivacidad(situacion: SituacionDePrivacidad): {
  puedeAceptar: boolean;
  puedeRetirar: boolean;
} {
  return {
    puedeAceptar: situacion.tipo === 'pendiente',
    puedeRetirar: situacion.tipo === 'vigente',
  };
}

// --- Las listas paginadas ------------------------------------------------

/**
 * Una lista que llega por paginas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS DOS HISTORIALES ESTAN PAGINADOS DE VERDAD.                          │
 * │                                                                          │
 * │ `/me/payments` y `/me/access` reciben `page` y `pageSize` —maximo 100—   │
 * │ y devuelven `total`. Pedir solo la primera pagina y callarse dejaria     │
 * │ datos del socio fuera de su alcance sin decirselo.                       │
 * │                                                                          │
 * │ Asi que se acumulan paginas: es lo que ya ofrece el contrato, no una     │
 * │ capacidad inventada.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const POR_PAGINA = 50;

export interface Acumulado<T> {
  elementos: readonly T[];
  total: number;
  /** La ultima pagina que se ha traido. */
  pagina: number;
}

export function acumular<T>(
  previo: Acumulado<T> | null,
  respuesta: { items: readonly T[]; total: number; page: number },
): Acumulado<T> {
  // Una pagina que ya se tenia no se duplica: puede llegar dos veces si se
  // refresca mientras carga.
  if (previo && respuesta.page <= previo.pagina) {
    return { elementos: respuesta.items, total: respuesta.total, pagina: respuesta.page };
  }
  return {
    elementos: [...(previo?.elementos ?? []), ...respuesta.items],
    total: respuesta.total,
    pagina: respuesta.page,
  };
}

export function quedanMas(acumulado: Acumulado<unknown>): boolean {
  return acumulado.elementos.length < acumulado.total;
}

/** "Quedan 12 más". Solo si de verdad quedan. */
export function cuantosQuedan(acumulado: Acumulado<unknown>): number {
  return Math.max(acumulado.total - acumulado.elementos.length, 0);
}

// --- La carga ------------------------------------------------------------

export type EstadoDeCarga<T> =
  | { fase: 'cargando' }
  | { fase: 'ok'; datos: T }
  | { fase: 'fallo'; mensaje: string };
