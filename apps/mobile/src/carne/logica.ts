/**
 * Las decisiones del carne, sin React y sin red.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TODO ESTO SALE DEL CONTRATO REAL, NO DE SUPONER.                        │
 * │                                                                          │
 * │ POST /me/access/token -> { token, expiresAt, ttlSeconds }                │
 * │   ttlSeconds = 60. Comprobado contra el fixture: vida real 60 s.        │
 * │   Cada llamada devuelve un token NUEVO.                                  │
 * │   El jti se consume al escanear: un codigo no abre dos veces.           │
 * │                                                                          │
 * │ GET /me/dues -> { estado, puedeAcceder, diasRestantes, hasta, planName } │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Lo que devuelve el servidor al pedir un codigo. */
export interface CodigoDeAcceso {
  token: string;
  expiresAt: string;
}

/**
 * Segundos que le quedan al codigo. Nunca negativo: caducado es caducado.
 *
 * Se cuenta contra `expiresAt` DEL SERVIDOR y no contra un contador local: si
 * el reloj del telefono va adelantado, lo que manda es la hora a la que el
 * servidor dijo que caduca.
 */
export function segundosRestantes(expiresAt: string, ahora: number = Date.now()): number {
  const queda = new Date(expiresAt).getTime() - ahora;
  if (Number.isNaN(queda)) return 0;
  return queda <= 0 ? 0 : Math.ceil(queda / 1000);
}

/**
 * En que punto esta el codigo que hay en pantalla.
 *
 * `porCaducar` existe para avisar ANTES, no para bloquear: quien esta en la
 * cola del torno con ocho segundos quiere saberlo antes de que el escaner
 * falle.
 */
export type EstadoDelCodigo = 'sinCodigo' | 'vigente' | 'porCaducar' | 'caducado';

/** A partir de aqui se avisa. Un sexto del minuto que dura. */
export const SEGUNDOS_DE_AVISO = 10;

export function estadoDelCodigo(
  codigo: CodigoDeAcceso | null,
  ahora: number = Date.now(),
): EstadoDelCodigo {
  if (!codigo) return 'sinCodigo';
  const quedan = segundosRestantes(codigo.expiresAt, ahora);
  if (quedan === 0) return 'caducado';
  return quedan <= SEGUNDOS_DE_AVISO ? 'porCaducar' : 'vigente';
}

/**
 * Lo que se dice debajo del codigo.
 *
 * En TEXTO, porque el QR no puede ser la unica informacion: quien no ve la
 * pantalla necesita saber si su codigo sigue valiendo, y un numero suelto no
 * lo dice.
 */
export function textoDeCuentaAtras(segundos: number): string {
  if (segundos <= 0) return 'El código ha caducado. Genera otro.';
  if (segundos === 1) return 'El código caduca en 1 segundo.';
  return `El código caduca en ${segundos} segundos.`;
}

/** Cada cuanto se repinta la cuenta atras. Una vez por segundo, no por fotograma. */
export const CADA_CUANTO_MS = 1000;

// --- La cuota ------------------------------------------------------------

/**
 * Las frases de la cuota se MUDARON a  en M5, cuando
 * Inicio empezo a necesitarlas: dejarlas aqui habria obligado a que Inicio
 * importara del Carne, o a escribirlas una tercera vez.
 *
 * Se reexportan para que quien ya las importaba de aqui siga funcionando.
 */
export { avisaDeQueLaPuertaPuedeNegar, lecturaDeCuota, type LecturaDeCuota } from '../cuota/lectura';

// --- La politica de generacion -------------------------------------------

/** En que punto esta el pase que se enseña. */
export type EstadoDelPase =
  | { fase: 'pidiendo' }
  | { fase: 'listo'; codigo: CodigoDeAcceso }
  | { fase: 'caducado' }
  | { fase: 'error'; mensaje: string };

/**
 * Al ENTRAR en Carne se pide siempre uno nuevo. Siempre, sin excepcion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUNQUE EL ANTERIOR TODAVIA NO HAYA CADUCADO.                            │
 * │                                                                          │
 * │ El codigo es de UN SOLO USO y el cliente no tiene forma de saber si un   │
 * │ escaner ya lo consumio: el servidor invalida el `jti` al validarlo y no  │
 * │ avisa a nadie. Conservar el de hace treinta segundos es arriesgarse a    │
 * │ que alguien enseñe en el torno un codigo ya gastado y no entienda por    │
 * │ que no abre.                                                             │
 * │                                                                          │
 * │ Entrar en Carne ES el gesto de querer enseñar un pase ahora. Cuesta una  │
 * │ peticion; el error contrario cuesta quedarse en la puerta.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const SE_PIDE_AL_ENTRAR = true;

/**
 * Si al volver del segundo plano hay que pedir otro.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI SI SE CONSERVA EL QUE VALE, Y NO ES UNA INCOHERENCIA.              │
 * │                                                                          │
 * │ Volver a la pantalla es un gesto: alguien ha decidido ir a Carne. Volver │
 * │ del segundo plano no lo es — puede ser una notificacion, una llamada o   │
 * │ el bloqueo de pantalla mientras se hace la cola. Si el codigo que ya     │
 * │ estaba delante sigue vivo, pedir otro solo lo invalidaria justo cuando   │
 * │ la persona levanta el telefono hacia el lector.                          │
 * │                                                                          │
 * │ Sin codigo, caducado o con error: se pide. Con uno en vuelo: no, que ya  │
 * │ hay una peticion hecha.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function debePedirTrasSegundoPlano(
  pase: EstadoDelPase,
  ahora: number = Date.now(),
): boolean {
  switch (pase.fase) {
    case 'pidiendo':
      return false;
    case 'listo':
      return segundosRestantes(pase.codigo.expiresAt, ahora) === 0;
    case 'caducado':
    case 'error':
      return true;
  }
}

/**
 * Si el pase que hay debe retirarse de la pantalla por haber caducado.
 *
 * Se retira ENTERO, no se deja en gris: un QR a la vista invita a enseñarlo,
 * y uno caducado no abre. Lo que queda en su sitio es el hueco y el boton.
 */
export function haCaducado(pase: EstadoDelPase, ahora: number = Date.now()): boolean {
  return pase.fase === 'listo' && segundosRestantes(pase.codigo.expiresAt, ahora) === 0;
}
