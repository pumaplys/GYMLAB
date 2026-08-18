import type { AccessDecision, AccessReason, AccessResult } from '@gymlab/contracts';

/**
 * Lo que el mostrador lee cuando escanea un carne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NINGUN MOTIVO CAE EN UN MENSAJE GENERICO, Y EL TIPO LO OBLIGA.          │
 * │                                                                          │
 * │ `Record<AccessReason, …>` significa que anadir un motivo al contrato      │
 * │ ROMPE LA COMPILACION hasta que alguien decida como se le cuenta a quien   │
 * │ esta en la puerta. Sin eso, el motivo nuevo caeria en un `default` y      │
 * │ recepcion veria "acceso denegado" sin saber por que — que es justo el     │
 * │ momento en que necesita saberlo, con una persona esperando delante.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los textos hablan de lo que hay que HACER, no del estado interno. «Cuota
 * vencida» no le dice a nadie que hacer; «cuota vencida: cobrar antes de dejar
 * pasar» si.
 */
export const MENSAJE_DEL_MOTIVO: Record<AccessReason, string> = {
  OK: 'Acceso correcto.',
  DUES_WARN: 'La cuota vence pronto. Puede pasar, pero avísale.',
  DUES_EXPIRED: 'Cuota vencida. Cóbrala antes de dejarle pasar.',
  NO_SUBSCRIPTION: 'No tiene ninguna cuota dada de alta. Dale de alta una.',
  MEMBER_INACTIVE: 'Este socio está de baja. No debe pasar.',
  TOKEN_EXPIRED: 'El código ha caducado. Pídele que lo genere otra vez.',
  TOKEN_REUSED: 'Este código ya se usó. Pídele que genere uno nuevo.',
  BAD_SIGNATURE: 'El código no es válido. No lo ha emitido este gimnasio.',
  UNKNOWN_MEMBER: 'El código no corresponde a ningún socio de este gimnasio.',
};

/**
 * Detalle que solo tiene sentido en algunos motivos.
 *
 * Los días restantes son lo que convierte un aviso en algo util: «vence pronto»
 * no dice nada, «vence en 2 días» si. En los motivos donde no aplica no se
 * inventa nada.
 */
export function detalleDeCuota(resultado: AccessResult): string | null {
  const { reason, diasRestantes } = resultado;
  if (diasRestantes === null) return null;

  if (reason === 'DUES_WARN') {
    return diasRestantes === 1 ? 'Vence mañana.' : `Vence en ${diasRestantes} días.`;
  }
  if (reason === 'DUES_EXPIRED') {
    const dias = Math.abs(diasRestantes);
    return dias === 0
      ? 'Venció hoy.'
      : dias === 1
        ? 'Venció ayer.'
        : `Venció hace ${dias} días.`;
  }
  return null;
}

/** El nombre completo del socio, o null si el token no identifica a nadie. */
export function nombreDelSocio(resultado: AccessResult): string | null {
  if (!resultado.member) return null;
  return `${resultado.member.firstName} ${resultado.member.lastName}`.trim();
}

/**
 * El tono con el que se pinta el resultado.
 *
 * Sale de `decision` y no de `reason`: quien decide si alguien pasa es el
 * servidor, y traducir el motivo a un color por nuestra cuenta abriria la
 * puerta a que la pantalla diga verde sobre un DENY.
 */
export function tonoDeLaDecision(decision: AccessDecision): 'exito' | 'informacion' | 'error' {
  switch (decision) {
    case 'ALLOW':
      return 'exito';
    case 'WARN':
      return 'informacion';
    case 'DENY':
      return 'error';
  }
}

export const TITULO_DE_LA_DECISION: Record<AccessDecision, string> = {
  ALLOW: 'PASA',
  WARN: 'PASA — con aviso',
  DENY: 'NO PASA',
};

/**
 * Si merece la pena enviar este texto al servidor.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CAMARA LEE EL MISMO CODIGO MUCHAS VECES POR SEGUNDO.                 │
 * │                                                                          │
 * │ Un QR delante del objetivo se decodifica en cada fotograma. Sin este     │
 * │ filtro, un solo carne generaria decenas de peticiones: la primera        │
 * │ consumiria el token y las siguientes irian contra el limite de la ventana │
 * │ de reintento, de modo que la pantalla acabaria mostrando `TOKEN_REUSED`   │
 * │ sobre un acceso que en realidad estuvo bien.                             │
 * │                                                                          │
 * │ Se compara con el ULTIMO enviado, no con una lista: el mismo socio puede  │
 * │ volver a entrar mas tarde con un token nuevo, y ese si debe pasar.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function debeEnviar(
  token: string,
  estado: { ultimoEnviado: string | null; procesando: boolean },
): boolean {
  if (estado.procesando) return false;
  if (token.trim() === '') return false;
  return token !== estado.ultimoEnviado;
}

/**
 * Formato que se le pide al detector del navegador.
 *
 * Solo `qr_code`: pedir todos los formatos hace que el detector busque codigos
 * de barras de producto en cada fotograma, que aqui no van a aparecer nunca.
 */
export const FORMATOS_DEL_DETECTOR = ['qr_code'] as const;
