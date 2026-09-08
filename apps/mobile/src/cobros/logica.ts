import type {
  DuesState,
  PaymentConcept,
  Plan,
  PlanPeriod,
  RegisterPaymentInput,
} from '@gymlab/contracts';
import type { PAYMENT_METHODS } from '@gymlab/contracts';

/**
 * El metodo de pago, derivado del contrato.
 *
 * `@gymlab/contracts` exporta `paymentMethodSchema` y `PAYMENT_METHODS` pero NO
 * el tipo suelto —a diferencia de `PaymentConcept` y `PlanPeriod`, que si—. Se
 * deriva aqui en vez de tocar el contrato, que esta bajo freeze: da exactamente
 * el mismo tipo y se mueve solo si el contrato se mueve. Es el mismo camino que
 * ya sigue `Membresia` en `auth/estado.ts`.
 */
export type MetodoDePago = (typeof PAYMENT_METHODS)[number];

/**
 * Cuotas, cobros y planes en pantalla.
 *
 * Las mismas decisiones que toma el panel web. Se comparan las dos con tests:
 * un mostrador que ofrece acciones distintas segun se atienda desde el
 * ordenador o desde el telefono no es un mostrador.
 */

/** Que se puede hacer con una cuota segun como este. */
export interface AccionesDeCuota {
  congelar: boolean;
  reanudar: boolean;
  darDeBaja: boolean;
}

const NINGUNA: AccionesDeCuota = { congelar: false, reanudar: false, darDeBaja: false };

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA FILA POR ESTADO, ESCRITA. SIN `default`.                            │
 * │                                                                          │
 * │ `Record<DuesState, …>` obliga a decidir que hacer con un estado nuevo    │
 * │ del contrato. Con un `default`, ese estado heredaria en silencio las      │
 * │ acciones de otro y podria ofrecer congelar una cuota que el servidor     │
 * │ rechaza.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const ACCIONES_POR_ESTADO: Record<DuesState, AccionesDeCuota> = {
  // Dentro de periodo: se puede congelar y se puede dar de baja.
  AL_CORRIENTE: { congelar: true, reanudar: false, darDeBaja: true },
  POR_VENCER: { congelar: true, reanudar: false, darDeBaja: true },

  /*
   * Vencida —con cortesia o sin ella—: NO se ofrece congelar. El servidor lo
   * rechaza porque no quedan dias que guardar, y un boton que siempre falla es
   * peor que no tenerlo.
   */
  EN_GRACIA: { congelar: false, reanudar: false, darDeBaja: true },
  VENCIDA: { congelar: false, reanudar: false, darDeBaja: true },

  // Congelada: solo se reanuda o se da de baja.
  PAUSADA: { congelar: false, reanudar: true, darDeBaja: true },

  // Sin cuota no hay nada que congelar ni que dar de baja.
  SIN_SUSCRIPCION: NINGUNA,
};

export function accionesDeCuota(estado: DuesState): AccionesDeCuota {
  return ACCIONES_POR_ESTADO[estado];
}

/** Si una cuota ya no admite ninguna accion de ciclo de vida. */
export function sinAcciones(estado: DuesState): boolean {
  const a = accionesDeCuota(estado);
  return !a.congelar && !a.reanudar && !a.darDeBaja;
}

/** Solo se puede dar de alta una cuota si no hay ninguna viva. */
export function sePuedeDarDeAlta(estado: DuesState): boolean {
  return estado === 'SIN_SUSCRIPCION';
}

// --- Dinero ---------------------------------------------------------------

/**
 * Lo que se teclea en el mostrador -> centimos enteros. `null` si no vale.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN MULTIPLICAR POR 100 EN NINGUN MOMENTO.                               │
 * │                                                                          │
 * │ `Number('19.99') * 100` da 1998.9999999999998. Con `Math.round` encima   │
 * │ sale bien para dos decimales —lo comprobo una falsificacion, que NO      │
 * │ fallo— pero la correccion depende entonces de que nadie quite ese        │
 * │ redondeo: `Math.trunc` o un `| 0` sobre lo mismo da 1998, y son un       │
 * │ cambio de una palabra.                                                   │
 * │                                                                          │
 * │ Aqui se separan las dos mitades como TEXTO y se suman enteros: no hay    │
 * │ ningun paso en coma flotante que pueda desviarse, asi que no hay nada    │
 * │ que quitar sin querer.                                                   │
 * │                                                                          │
 * │ Es la misma funcion que usa el panel web, y hay un test que compara las  │
 * │ dos: el dinero no puede depender de desde donde se cobre.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se acepta coma o punto: en un teclado español sale coma, y en el numerico de
 * muchos teclados sale punto.
 */
export function aCentimos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;

  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

// --- Como se dice cada cosa ----------------------------------------------

/**
 * `Record<…>` en los cuatro: un metodo, concepto, periodo o estado nuevo del
 * contrato no compila hasta que alguien decide como se llama en castellano.
 */
export const NOMBRE_DEL_METODO: Record<MetodoDePago, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

export const NOMBRE_DEL_CONCEPTO: Record<PaymentConcept, string> = {
  subscription: 'Cuota',
  enrolment: 'Matrícula',
  other: 'Otro',
};

export const NOMBRE_DEL_PERIODO: Record<PlanPeriod, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

export const METODOS = Object.keys(NOMBRE_DEL_METODO) as MetodoDePago[];
export const CONCEPTOS = Object.keys(NOMBRE_DEL_CONCEPTO) as PaymentConcept[];
export const PERIODOS = Object.keys(NOMBRE_DEL_PERIODO) as PlanPeriod[];

/** Lo que se manda al registrar un cobro. */
export function cobroAEnvio(
  concepto: PaymentConcept,
  metodo: MetodoDePago,
  centimos: number,
  nota: string,
): RegisterPaymentInput {
  return {
    concept: concepto,
    method: metodo,
    amountCents: centimos,
    // `paidOn` se omite: por defecto es hoy, en la zona horaria del gimnasio,
    // y adivinar la fecha desde el telefono seria adivinar el huso.
    ...(nota.trim() ? { note: nota.trim() } : {}),
  };
}

// --- Planes ---------------------------------------------------------------

/**
 * Los planes que se pueden CONTRATAR: solo los activos.
 *
 * Un plan archivado sigue existiendo porque hay suscripciones que lo usan, y
 * el servidor rechaza contratarlo. Ofrecerlo seria ofrecer un error.
 */
export function planesContratables(planes: readonly Plan[]): Plan[] {
  return planes
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Todos, con los archivados al final: el dueño necesita verlos para saber que
 * existen —y en V1 no se desarchivan—.
 */
export function ordenarPlanes(planes: readonly Plan[]): Plan[] {
  const porNombre = (a: Plan, b: Plan) => a.name.localeCompare(b.name, 'es');
  return [
    ...planes.filter((p) => p.status === 'active').sort(porNombre),
    ...planes.filter((p) => p.status !== 'active').sort(porNombre),
  ];
}

/** La segunda linea de un plan: cada cuanto, y a cuantos les afecta. */
export function lineaDePlan(plan: Plan, comoImporte: (c: number, m: string) => string): string {
  const precio = comoImporte(plan.priceCents, plan.currency);
  const cada = NOMBRE_DEL_PERIODO[plan.period].toLowerCase();
  const base = `${precio} · ${cada}`;
  if (plan.status !== 'active') return `${base} · archivado`;
  const n = plan.activeSubscriptions;
  if (n === 0) return `${base} · sin suscripciones`;
  return `${base} · ${n === 1 ? '1 suscripción' : `${n} suscripciones`}`;
}

/**
 * Archivar un plan solo tiene sentido si esta activo. Y NO se desarchiva: el
 * contrato no lo contempla, igual que con las rutinas.
 */
export function tieneSentidoArchivarPlan(estado: Plan['status']): boolean {
  return estado === 'active';
}
