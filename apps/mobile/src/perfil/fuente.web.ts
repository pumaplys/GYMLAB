import type {
  HealthConsentStatus,
  Member,
  OwnAccessEventList,
  OwnPaymentList,
} from '@gymlab/contracts';
import {
  aceptarPrivacidadReal,
  cargarAccesosReal,
  cargarFichaReal,
  cargarPagosReal,
  cargarPrivacidadReal,
  retirarPrivacidadReal,
} from './fuente-real';
import { POR_PAGINA } from './logica';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DE PERFIL. SOLO WEB, SOLO CON LA VARIABLE, SOLO ?vista=.   │
 * │                                                                          │
 * │ Sin `?vista=` esto es la fuente de verdad, tal cual. Y no viaja: el      │
 * │ fichero es `.web.ts`, asi que en iOS y Android Metro coge `fuente.ts`.   │
 * │                                                                          │
 * │ Los datos son de una persona que no existe. En la base de datos de       │
 * │ desarrollo la socia tiene DOS pagos, CERO accesos y su gimnasio no ha    │
 * │ publicado texto de privacidad: los estados ricos solo existen aqui, y no │
 * │ se inventan filas en la base de datos para poder hacer capturas.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

const FICHA: Member = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  memberNumber: 128,
  firstName: 'Socia',
  lastName: 'de Muestra',
  email: 'vista.previa@ejemplo.local',
  phone: null,
  birthDate: null,
  status: 'active',
  joinedAt: '2026-01-10T09:00:00.000Z',
  leftAt: null,
  hasAccount: true,
} as Member;

function pago(
  id: string,
  paidOn: string,
  amountCents: number,
  concept: 'subscription' | 'enrolment' | 'other',
  method: 'cash' | 'card' | 'transfer' | 'other',
  anulado?: { voidedAt: string; voidReason: string | null },
) {
  return {
    id,
    concept,
    amountCents,
    currency: 'EUR',
    method,
    // FECHA CIVIL: la columna es `date` y la API la emite cruda.
    paidOn,
    voidedAt: anulado?.voidedAt ?? null,
    voidReason: anulado?.voidReason ?? null,
  };
}

/*
 * Nueve pagos: cuotas mensuales, la matricula del principio, uno por
 * transferencia, uno anulado con su motivo y un importe de cuatro cifras para
 * ver el separador de millares.
 */
const PAGOS = [
  pago('p9', '2026-08-20', 3500, 'subscription', 'card'),
  pago('p8', '2026-07-21', 3500, 'subscription', 'card'),
  pago('p7', '2026-06-19', 3500, 'subscription', 'cash'),
  pago('p6', '2026-05-20', 3500, 'subscription', 'card', {
    voidedAt: '2026-05-22T10:15:00.000Z',
    voidReason: 'Cobro duplicado en el mostrador',
  }),
  pago('p5', '2026-05-20', 3500, 'subscription', 'card'),
  pago('p4', '2026-04-18', 3500, 'subscription', 'transfer'),
  pago('p3', '2026-03-20', 3500, 'subscription', 'cash'),
  pago('p2', '2026-02-20', 129900, 'other', 'transfer'),
  pago('p1', '2026-01-10', 1500, 'enrolment', 'cash'),
];

/** Los DOS pagos que de verdad tiene la socia del fixture. */
const PAGOS_FIXTURE = [
  pago('f2', '2026-08-20', 3500, 'subscription', 'cash'),
  pago('f1', '2026-08-20', 1500, 'enrolment', 'cash'),
];

function acceso(
  occurredAt: string,
  decision: 'ALLOW' | 'WARN' | 'DENY',
  reason: 'OK' | 'DUES_WARN' | 'DUES_EXPIRED' | 'NO_SUBSCRIPTION' | 'MEMBER_INACTIVE' | 'TOKEN_REUSED',
  isRetry = false,
) {
  return { decision, reason, isRetry, occurredAt };
}

/*
 * Los tres resultados que el contrato permite en el historial de un socio, mas
 * un reintento del lector. Los motivos tecnicos —firma invalida, token
 * caducado— no aparecen: se registran SIN socio y no son de nadie.
 */
const ACCESOS = [
  acceso('2026-09-03T18:42:00.000Z', 'ALLOW', 'OK'),
  acceso('2026-09-01T07:15:00.000Z', 'ALLOW', 'OK'),
  acceso('2026-08-30T19:02:00.000Z', 'ALLOW', 'OK', true),
  acceso('2026-08-30T19:02:00.000Z', 'ALLOW', 'OK'),
  acceso('2026-08-28T18:30:00.000Z', 'WARN', 'DUES_WARN'),
  acceso('2026-08-26T07:40:00.000Z', 'ALLOW', 'OK'),
  acceso('2026-08-24T20:11:00.000Z', 'DENY', 'DUES_EXPIRED'),
  acceso('2026-08-22T18:55:00.000Z', 'DENY', 'TOKEN_REUSED'),
];

const DOCUMENTO = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  version: '2026-09-01',
  title: 'Tratamiento de datos de salud',
  body:
    'Tu gimnasio quiere registrar tu peso y tus medidas corporales para hacer el seguimiento de ' +
    'tu entrenamiento. Son datos de salud y la ley los protege de forma especial, así que solo ' +
    'puede hacerlo si tú se lo permites.\n\n' +
    'Si das tu permiso, tu entrenador podrá anotar esas mediciones en tu ficha y tú podrás ' +
    'consultarlas en la aplicación. No se comparten con nadie más ni se usan para otra cosa.\n\n' +
    'Puedes retirar el permiso cuando quieras, sin dar explicaciones. A partir de ese momento no ' +
    'se registrarán mediciones nuevas. Las que ya existan se conservan, porque el gimnasio debe ' +
    'poder atenderte si pides acceder a ellas o que se borren.',
  controller:
    'Gimnasio de Muestra S.L., NIF B00000000, Calle de Muestra 1, Madrid. ' +
    'Privacidad: privacidad@ejemplo.local',
  publishedAt: '2026-09-01T08:00:00.000Z',
};

function consentimiento(parcial: Partial<HealthConsentStatus>): HealthConsentStatus {
  return {
    currentVersion: DOCUMENTO.version,
    accepted: false,
    acceptedAt: null,
    document: DOCUMENTO,
    ...parcial,
  } as HealthConsentStatus;
}

/** Lo que de verdad ve la socia hoy: su gimnasio no ha publicado texto. */
const SIN_TEXTO = {
  currentVersion: null,
  accepted: false,
  acceptedAt: null,
  document: null,
} as HealthConsentStatus;

type Guion =
  | 'completo'
  | 'cuota-problema'
  | 'fixture-real'
  | 'vacio'
  | 'cargando'
  | 'error'
  | 'privacidad-vigente'
  | 'privacidad-pendiente'
  | 'privacidad-sin-texto';

const CASOS: Record<string, Guion> = {
  'perfil-completo': 'completo',
  'perfil-cuota-problema': 'cuota-problema',
  'perfil-cargando': 'cargando',
  'perfil-error': 'error',

  'pagos-varios': 'completo',
  // Los dos pagos reales del fixture, con nombres ficticios.
  'pagos-fixture-real': 'fixture-real',
  'pagos-vacio': 'vacio',
  'pagos-cargando': 'cargando',
  'pagos-error': 'error',

  'accesos-varios': 'completo',
  // El estado real: la base de datos de desarrollo no tiene ni un acceso.
  'accesos-vacio': 'vacio',
  'accesos-cargando': 'cargando',
  'accesos-error': 'error',

  'privacidad-activa': 'privacidad-vigente',
  'privacidad-pendiente': 'privacidad-pendiente',
  // El estado del fixture: el gimnasio no ha publicado texto legal.
  'privacidad-sin-texto': 'privacidad-sin-texto',
  'privacidad-cargando': 'cargando',
  'privacidad-error': 'error',
};

function casoActual(): Guion | null {
  if (!HABILITADA) return null;
  const nombre = new URLSearchParams(window.location.search).get('vista');
  return nombre ? (CASOS[nombre] ?? null) : null;
}

const nuncaTermina = <T,>() => new Promise<T>(() => undefined);

export async function cargarFicha(): Promise<Member> {
  const caso = casoActual();
  if (!caso) return cargarFichaReal();
  if (caso === 'cargando') return nuncaTermina<Member>();
  if (caso === 'error') throw new Error('perfil de muestra: fallo simulado');
  return FICHA;
}

function paginar<T>(todos: readonly T[], pagina: number) {
  const desde = (pagina - 1) * POR_PAGINA;
  return { items: todos.slice(desde, desde + POR_PAGINA), total: todos.length, page: pagina, pageSize: POR_PAGINA };
}

export async function cargarPagos(pagina: number): Promise<OwnPaymentList> {
  const caso = casoActual();
  if (!caso) return cargarPagosReal(pagina);
  if (caso === 'cargando') return nuncaTermina<OwnPaymentList>();
  if (caso === 'error') throw new Error('pagos de muestra: fallo simulado');
  if (caso === 'vacio') return paginar([], pagina) as OwnPaymentList;
  if (caso === 'fixture-real') return paginar(PAGOS_FIXTURE, pagina) as OwnPaymentList;
  return paginar(PAGOS, pagina) as OwnPaymentList;
}

export async function cargarAccesos(pagina: number): Promise<OwnAccessEventList> {
  const caso = casoActual();
  if (!caso) return cargarAccesosReal(pagina);
  if (caso === 'cargando') return nuncaTermina<OwnAccessEventList>();
  if (caso === 'error') throw new Error('accesos de muestra: fallo simulado');
  if (caso === 'vacio') return paginar([], pagina) as OwnAccessEventList;
  return paginar(ACCESOS, pagina) as OwnAccessEventList;
}

export async function cargarPrivacidad(): Promise<HealthConsentStatus> {
  const caso = casoActual();
  if (!caso) return cargarPrivacidadReal();
  if (caso === 'cargando') return nuncaTermina<HealthConsentStatus>();
  if (caso === 'error') throw new Error('privacidad de muestra: fallo simulado');
  if (caso === 'privacidad-sin-texto') return SIN_TEXTO;
  if (caso === 'privacidad-vigente') {
    return consentimiento({ accepted: true, acceptedAt: '2026-09-02T17:30:00.000Z' });
  }
  return consentimiento({});
}

/* Las dos acciones devuelven el estado resultante, como hace el servidor. */
export async function aceptarPrivacidad(version: string): Promise<HealthConsentStatus> {
  const caso = casoActual();
  if (!caso) return aceptarPrivacidadReal(version);
  return consentimiento({ accepted: true, acceptedAt: new Date().toISOString() });
}

export async function retirarPrivacidad(): Promise<HealthConsentStatus> {
  const caso = casoActual();
  if (!caso) return retirarPrivacidadReal();
  return consentimiento({ accepted: false, acceptedAt: null });
}
