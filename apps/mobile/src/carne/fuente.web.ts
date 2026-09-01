import type { DuesStatus, Member } from '@gymlab/contracts';
import type { CodigoDeAcceso } from './logica';
import { cargarCarneReal, pedirCodigoReal, type DatosDelCarne } from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DEL CARNE. SOLO WEB, SOLO CON LA VARIABLE, SOLO CON ?vista=.│
 * │                                                                          │
 * │ Sirve para MIRAR los estados del carne mientras la validacion en iPhone  │
 * │ sigue bloqueada. Sin `?vista=` esto es la fuente de verdad, tal cual.    │
 * │                                                                          │
 * │ EL TOKEN DE MUESTRA NO ES UN TOKEN. Es una cadena inventada que empieza  │
 * │ por GYMLAB-DEMO y no la firma nadie: escaneada en un torno no abre nada. │
 * │ No sale del fixture, no sale de produccion y no es una credencial.       │
 * │                                                                          │
 * │ Y no viaja: este fichero es `.web.ts`, asi que en iOS y Android Metro    │
 * │ coge `fuente.ts` y nada de esto se empaqueta.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

const FICHA: Member = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  memberNumber: 128,
  firstName: 'Socia',
  lastName: 'de Muestra',
  email: null,
  phone: null,
  birthDate: null,
  status: 'active',
  joinedAt: '2026-01-10',
  leftAt: null,
  hasAccount: true,
} as Member;

function cuota(parcial: Partial<DuesStatus>): DuesStatus {
  return {
    estado: 'AL_CORRIENTE',
    puedeAcceder: true,
    diasRestantes: 19,
    hasta: '2026-09-20',
    planName: 'Mensual',
    ...parcial,
  } as DuesStatus;
}

/**
 * Un token de mentira con la MISMA longitud que el real (119 caracteres), para
 * que el codigo que se dibuja tenga la misma densidad de modulos que tendra en
 * produccion. Si fuera mas corto, la preview enseñaria un QR mas simple del
 * que se va a ver de verdad.
 */
const TOKEN_DE_MUESTRA = `GYMLAB-DEMO-NO-VALIDO-${'0123456789abcdefghijklmnopqrstuvwxyz'.repeat(4)}`.slice(
  0,
  119,
);

interface CasoDeCarne {
  cuota: DuesStatus;
  /** Segundos de vida del codigo al generarlo, o `null` si la carga falla. */
  vidaDelCodigo: number | null;
  carga: 'ok' | 'nunca-termina' | 'falla';
}

const CASOS: Record<string, CasoDeCarne> = {
  'carne-activa': { cuota: cuota({}), vidaDelCodigo: 55, carga: 'ok' },
  'carne-expira-pronto': { cuota: cuota({}), vidaDelCodigo: 7, carga: 'ok' },
  'carne-vencida': {
    cuota: cuota({ estado: 'VENCIDA', puedeAcceder: false, diasRestantes: -4, hasta: '2026-08-28' }),
    vidaDelCodigo: 55,
    carga: 'ok',
  },
  'carne-congelada': {
    cuota: cuota({ estado: 'PAUSADA', puedeAcceder: false, diasRestantes: null }),
    vidaDelCodigo: 55,
    carga: 'ok',
  },
  'carne-cargando': { cuota: cuota({}), vidaDelCodigo: null, carga: 'nunca-termina' },
  'carne-error': { cuota: cuota({}), vidaDelCodigo: null, carga: 'falla' },
};

function casoActual(): CasoDeCarne | null {
  if (!HABILITADA) return null;
  const nombre = new URLSearchParams(window.location.search).get('vista');
  return nombre ? (CASOS[nombre] ?? null) : null;
}

export type { DatosDelCarne };

export async function cargarCarne(): Promise<DatosDelCarne> {
  const caso = casoActual();
  if (!caso) return cargarCarneReal();

  if (caso.carga === 'nunca-termina') return new Promise<DatosDelCarne>(() => undefined);
  if (caso.carga === 'falla') throw new Error('carne de muestra: fallo simulado');
  return { ficha: FICHA, cuota: caso.cuota };
}

export async function pedirCodigo(): Promise<CodigoDeAcceso> {
  const caso = casoActual();
  if (!caso || caso.vidaDelCodigo === null) return pedirCodigoReal();

  return {
    token: TOKEN_DE_MUESTRA,
    expiresAt: new Date(Date.now() + caso.vidaDelCodigo * 1000).toISOString(),
  };
}
