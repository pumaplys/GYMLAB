import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Firma y verificacion del token del QR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA CLAVE POR GIMNASIO, DERIVADA. No hay secretos en la base de datos.    │
 * │                                                                          │
 * │   clave_del_gimnasio = HKDF(semilla_de_plataforma, salt = gym_id)         │
 * │                                                                          │
 * │ Un token del gimnasio A no verifica en el B: la firma no cuadra. El cruce │
 * │ entre gimnasios es criptograficamente imposible, no una comprobacion que  │
 * │ alguien pueda olvidar — el mismo criterio que llevo a RLS en ADR-0002.    │
 * │                                                                          │
 * │ Se descarto guardar un secreto por gimnasio en la base de datos: hoy un   │
 * │ volcado filtra hashes, que no sirven para fabricar nada; con secretos     │
 * │ almacenados entregaria llaves capaces de firmar accesos.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * NO SE USA JWT a proposito. Controlamos los dos extremos, asi que no hace falta
 * una librería que negocie algoritmos — y con ello desaparece la familia entera
 * de fallos de confusion de algoritmo, empezando por `alg: none`.
 *
 * Disposicion binaria fija y no JSON porque la densidad del QR importa en la
 * puerta: un codigo mas pequeno se lee antes y con peor luz.
 *
 *   version   1 byte
 *   gym_id   16 bytes
 *   member_id 16 bytes
 *   jti      16 bytes
 *   exp       8 bytes (milisegundos, entero de 64 bits)
 *   ---------------------
 *   firma    32 bytes (HMAC-SHA-256 completo)
 *
 * 89 bytes -> unos 119 caracteres en base64url.
 */

const VERSION = 1;
const LONGITUD_CUERPO = 1 + 16 + 16 + 16 + 8;
const LONGITUD_FIRMA = 32;
const LONGITUD_TOTAL = LONGITUD_CUERPO + LONGITUD_FIRMA;

/** Vida del token. Suficiente para ensenarlo y corto para que no circule. */
export const TTL_MS = 60_000;

export interface AccessTokenPayload {
  gymId: string;
  memberId: string;
  jti: string;
  expiresAt: Date;
}

/**
 * Por que falla un token. Se distingue del motivo de negocio a proposito: esto
 * es el sobre, no la carta.
 */
export type TokenError = 'BAD_SIGNATURE' | 'TOKEN_EXPIRED';

/**
 * Clave del gimnasio.
 *
 * `info` fija el proposito: si algun dia se deriva otra clave de la misma
 * semilla, con otro `info`, las dos son independientes aunque el salt coincida.
 */
function claveDe(semilla: string, gymId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(semilla, 'utf8'), uuidABytes(gymId), 'gymlab-access-qr-v1', 32),
  );
}

function uuidABytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesAUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Firma un token nuevo para ese socio. No escribe nada en la base de datos. */
export function firmarToken(
  semilla: string,
  gymId: string,
  memberId: string,
  ahora = new Date(),
): { token: string; payload: AccessTokenPayload } {
  const jti = randomUUID();
  const expiresAt = new Date(ahora.getTime() + TTL_MS);

  const cuerpo = Buffer.alloc(LONGITUD_CUERPO);
  cuerpo.writeUInt8(VERSION, 0);
  uuidABytes(gymId).copy(cuerpo, 1);
  uuidABytes(memberId).copy(cuerpo, 17);
  uuidABytes(jti).copy(cuerpo, 33);
  cuerpo.writeBigInt64BE(BigInt(expiresAt.getTime()), 49);

  const firma = createHmac('sha256', claveDe(semilla, gymId)).update(cuerpo).digest();

  return {
    token: Buffer.concat([cuerpo, firma]).toString('base64url'),
    payload: { gymId, memberId, jti, expiresAt },
  };
}

/**
 * Verifica un token contra la clave del gimnasio QUE ESCANEA.
 *
 * El `gymId` no se toma del token: lo pone quien llama, a partir de la sesion del
 * escaner. Si el token dice otro gimnasio, la clave derivada es otra y la firma
 * falla — que es justo lo que se busca.
 */
export function verificarToken(
  semilla: string,
  gymIdDelEscaner: string,
  token: string,
  ahora = new Date(),
): { ok: true; payload: AccessTokenPayload } | { ok: false; error: TokenError } {
  let bruto: Buffer;
  try {
    bruto = Buffer.from(token, 'base64url');
  } catch {
    return { ok: false, error: 'BAD_SIGNATURE' };
  }

  // Longitud y version se comprueban antes de tocar la firma: un token con otra
  // forma no es un intento de falsificacion, es basura.
  if (bruto.length !== LONGITUD_TOTAL || bruto.readUInt8(0) !== VERSION) {
    return { ok: false, error: 'BAD_SIGNATURE' };
  }

  const cuerpo = bruto.subarray(0, LONGITUD_CUERPO);
  const firma = bruto.subarray(LONGITUD_CUERPO);
  const esperada = createHmac('sha256', claveDe(semilla, gymIdDelEscaner)).update(cuerpo).digest();

  // Comparacion en tiempo constante. Con `===` el tiempo de respuesta filtraria
  // cuantos bytes iniciales acerto quien lo intenta, y eso permite construir una
  // firma valida byte a byte.
  if (!timingSafeEqual(firma, esperada)) {
    return { ok: false, error: 'BAD_SIGNATURE' };
  }

  const expiresAt = new Date(Number(cuerpo.readBigInt64BE(49)));
  if (expiresAt <= ahora) {
    return { ok: false, error: 'TOKEN_EXPIRED' };
  }

  return {
    ok: true,
    payload: {
      gymId: bytesAUuid(cuerpo.subarray(1, 17)),
      memberId: bytesAUuid(cuerpo.subarray(17, 33)),
      jti: bytesAUuid(cuerpo.subarray(33, 49)),
      expiresAt,
    },
  };
}
