import type { AccessDecision, AccessReason, AccessResult } from '@gymlab/contracts';

/**
 * Lo que se lee en la puerta, sin React y sin camara.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE DECIDE QUIEN PASA. ESO LO DECIDE EL SERVIDOR.                 │
 * │                                                                          │
 * │ Este fichero traduce a castellano lo que ya vino decidido —`decision` y  │
 * │ `reason`— y nada mas. No hay una sola regla de negocio duplicada: ni     │
 * │ dias de cortesia, ni ventana de reintento, ni que cuenta como cuota      │
 * │ vencida. Todo eso vive en `apps/api/src/access/access.service.ts` y      │
 * │ tiene que vivir en un solo sitio.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * ¿Esto que ha leido la camara es un carne de RINDA?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO SE MANDA AL SERVIDOR CUALQUIER COSA QUE HAYA DELANTE DEL OBJETIVO.    │
 * │                                                                          │
 * │ Un QR es un contenedor de texto: el cartel de la wifi del gimnasio, la   │
 * │ tarjeta de visita de un comercial, el enlace de un folleto. Sin este     │
 * │ filtro, todos acabarian dentro de un `POST .../access/verify` — y con    │
 * │ ellos los datos personales que lleven, que no tenemos ningun motivo para │
 * │ enviar a ningun sitio.                                                   │
 * │                                                                          │
 * │ Ademas evita el ruido en la puerta: cada uno de esos volveria un DENY    │
 * │ por firma invalida, y recepcion veria un rojo grande por haber apuntado  │
 * │ sin querer a un cartel.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE UN RANGO Y NO LOS 119 CARACTERES EXACTOS DE HOY.                 │
 * │                                                                          │
 * │ El token de hoy son 89 bytes —version, gym, socio, jti, caducidad y      │
 * │ firma— que en base64url dan EXACTAMENTE 119 caracteres. Comprobado, y    │
 * │ hay un test que lo fija.                                                 │
 * │                                                                          │
 * │ Pero para el cliente el token es OPACO: el contrato solo promete         │
 * │ `string` de 1 a 500. Si algun dia se añade un campo dentro, una app ya   │
 * │ instalada que exigiera 119 dejaria de leer carnes validos en la puerta,  │
 * │ y el fallo apareceria en el peor sitio posible. El rango rechaza igual   │
 * │ todo lo que se va a colar de verdad —una URL lleva `:` y `/`, un texto   │
 * │ lleva espacios o tildes— sin atarse a un detalle interno del servidor.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const ALFABETO_BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Lo que promete el contrato: `z.string().min(1).max(500)`. */
export const LARGO_MAXIMO = 500;
/** Holgado por debajo del token real (119) y muy por encima de cualquier ruido. */
export const LARGO_MINIMO = 100;

export function esTokenDeAcceso(texto: string): boolean {
  const limpio = texto.trim();
  if (limpio.length < LARGO_MINIMO || limpio.length > LARGO_MAXIMO) return false;
  return ALFABETO_BASE64URL.test(limpio);
}

/**
 * Que hacer con esta persona, dicho para quien esta en el mostrador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `Record<AccessReason, …>` NO ES DECORACION.                              │
 * │                                                                          │
 * │ Si mañana el contrato añade un motivo, ESTE FICHERO DEJA DE COMPILAR     │
 * │ hasta que alguien decida como se cuenta. Sin eso, el motivo nuevo caeria │
 * │ en un `default` y en la puerta se leeria «acceso denegado» sin saber por │
 * │ que — justo cuando hace falta saberlo, con una persona esperando.        │
 * │                                                                          │
 * │ Es el mismo mecanismo que usa el escaner del panel web, y a proposito:   │
 * │ son dos copias del TEXTO, no de la decision. Compartirlas obligaria a    │
 * │ meter copy de interfaz en `@gymlab/contracts`, que es donde vive lo que  │
 * │ los dos extremos tienen que cumplir, no como se le habla a nadie.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los textos dicen que HACER, no como se llama el estado por dentro. «Cuota
 * vencida» no le dice a nadie que hacer; «cóbrala antes de dejarle pasar», si.
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
 * El veredicto en dos palabras, para leerlo de reojo.
 *
 * Sale de `decision` y NUNCA de `reason`: quien decide si alguien pasa es el
 * servidor. Deducir el color del motivo por nuestra cuenta abriria la puerta a
 * que la pantalla diga verde sobre un DENY.
 */
export const TITULO_DE_LA_DECISION: Record<AccessDecision, string> = {
  ALLOW: 'PASA',
  WARN: 'PASA — con aviso',
  DENY: 'NO PASA',
};

/** El papel de color con el que se pinta el veredicto. */
export function tonoDeLaDecision(decision: AccessDecision): 'exito' | 'aviso' | 'peligro' {
  switch (decision) {
    case 'ALLOW':
      return 'exito';
    case 'WARN':
      return 'aviso';
    case 'DENY':
      return 'peligro';
  }
}

/**
 * El detalle de la cuota, cuando el motivo lo admite.
 *
 * Los dias son lo que convierte un aviso en algo util: «vence pronto» no dice
 * nada; «vence en 2 días», si. Donde no aplica NO se inventa nada.
 */
export function detalleDeCuota(resultado: AccessResult): string | null {
  const { reason, diasRestantes } = resultado;
  if (diasRestantes === null) return null;

  if (reason === 'DUES_WARN') {
    return diasRestantes === 1 ? 'Vence mañana.' : `Vence en ${diasRestantes} días.`;
  }
  if (reason === 'DUES_EXPIRED') {
    const dias = Math.abs(diasRestantes);
    if (dias === 0) return 'Venció hoy.';
    return dias === 1 ? 'Venció ayer.' : `Venció hace ${dias} días.`;
  }
  return null;
}

/**
 * El nombre del socio, o null si el token no identifica a nadie de fiar.
 *
 * Se enseña por lo mismo que en el mostrador web: confirmar de un vistazo que
 * quien entra es quien dice el carne. Mientras no haya foto en la ficha, es la
 * unica defensa contra que alguien preste el telefono.
 */
export function nombreDelSocio(resultado: AccessResult): string | null {
  if (!resultado.member) return null;
  return `${resultado.member.firstName} ${resultado.member.lastName}`.trim();
}
