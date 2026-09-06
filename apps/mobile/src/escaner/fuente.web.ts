import type { AccessResult } from '@gymlab/contracts';
import { verificarCarneReal } from './fuente-real';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA DEL ESCANER. SOLO WEB, SOLO CON LA VARIABLE, SOLO ?vista=.  │
 * │                                                                          │
 * │ Existe para poder MIRAR los tres veredictos —ALLOW, WARN y DENY— en un   │
 * │ navegador y medir la pantalla. Sin `?vista=` esto es la fuente de verdad │
 * │ tal cual: reenvia a la API.                                              │
 * │                                                                          │
 * │ NINGUN DATO ES REAL. Los nombres son inventados y no hay ningun token de │
 * │ por medio: estas funciones devuelven el VEREDICTO ya hecho, que es lo    │
 * │ unico que la pantalla necesita para pintarse.                            │
 * │                                                                          │
 * │ Y no viaja: `.web.ts`, asi que en iOS y Android Metro coge `fuente.ts` y │
 * │ nada de esto se empaqueta. Lo comprueba el gate de aislamiento.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

/** Un socio de mentira, con la forma exacta que devuelve el contrato. */
const SOCIA = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  memberNumber: 128,
  firstName: 'Socia',
  lastName: 'de Muestra',
};

const VEREDICTOS: Record<string, AccessResult> = {
  'escaner-allow': {
    decision: 'ALLOW',
    reason: 'OK',
    member: SOCIA,
    diasRestantes: 19,
    isRetry: false,
  },
  'escaner-warn': {
    decision: 'WARN',
    reason: 'DUES_WARN',
    member: SOCIA,
    diasRestantes: 2,
    isRetry: false,
  },
  'escaner-deny': {
    decision: 'DENY',
    reason: 'DUES_EXPIRED',
    member: SOCIA,
    diasRestantes: -4,
    isRetry: false,
  },
  /* Un DENY sin socio: el token no identifica a nadie de fiar. */
  'escaner-deny-sin-socio': {
    decision: 'DENY',
    reason: 'BAD_SIGNATURE',
    member: null,
    diasRestantes: null,
    isRetry: false,
  },
  /* La relectura tolerada del mismo carne. Se dice, para no contar dos veces. */
  'escaner-reintento': {
    decision: 'ALLOW',
    reason: 'OK',
    member: SOCIA,
    diasRestantes: 19,
    isRetry: true,
  },
};

function casoActual(): string | null {
  if (!HABILITADA) return null;
  return new URLSearchParams(window.location.search).get('vista');
}

export async function verificarCarne(gymId: string, token: string): Promise<AccessResult> {
  const caso = casoActual();
  if (caso === 'escaner-fallo') throw new Error('escáner de muestra: fallo simulado');

  const veredicto = caso ? VEREDICTOS[caso] : undefined;
  if (!veredicto) return verificarCarneReal(gymId, token);
  return veredicto;
}
