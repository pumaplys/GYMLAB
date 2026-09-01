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
import type { DuesStatus } from '@gymlab/contracts';

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
  if (segundos <= 0) return 'El codigo ha caducado. Genera otro.';
  if (segundos === 1) return 'El codigo caduca en 1 segundo.';
  return `El codigo caduca en ${segundos} segundos.`;
}

/** Cada cuanto se repinta la cuenta atras. Una vez por segundo, no por fotograma. */
export const CADA_CUANTO_MS = 1000;

// --- La cuota ------------------------------------------------------------

export interface LecturaDeCuota {
  titulo: string;
  /** Que significa para el socio, en una frase. */
  explicacion: string;
  /**
   * El tono de la pastilla. Se usa el vocabulario de `Etiqueta` —donde el
   * neutro se llama 'neutro'— y no el de `Aviso`, que al mismo tono lo llama
   * 'informacion'. Los dos componentes nombran distinto lo mismo; queda
   * anotado como deuda del sistema visual.
   */
  tono: 'exito' | 'aviso' | 'peligro' | 'neutro';
}

/**
 * Traduce el estado de la cuota. NO lo calcula.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ESTADO YA VIENE RESUELTO POR EL SERVIDOR.                            │
 * │                                                                          │
 * │ Lo decide teniendo en cuenta el huso horario del gimnasio y sus dias de  │
 * │ cortesia, que son configurables. Deducirlo aqui a partir de `hasta`      │
 * │ daria otro resultado en cuanto alguien abriera la app desde otro pais, y │
 * │ el que estaria mal seria el de la pantalla.                             │
 * │                                                                          │
 * │ Se enumeran los SEIS estados uno a uno, sin `default`: si el servidor    │
 * │ añade uno, esto deja de compilar en lugar de enseñar una cuota en blanco.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * NO DICE COMO PAGAR, y no es un olvido: hoy no se puede pagar desde GYMLAB.
 */
export function lecturaDeCuota(cuota: DuesStatus): LecturaDeCuota {
  switch (cuota.estado) {
    case 'AL_CORRIENTE':
      return {
        titulo: 'Al corriente',
        explicacion: 'Tu cuota esta pagada y puedes entrenar.',
        tono: 'exito',
      };
    case 'POR_VENCER':
      return {
        titulo: 'Vence pronto',
        explicacion: 'Todavia puedes entrenar. Renuevala en tu gimnasio antes de que caduque.',
        tono: 'aviso',
      };
    case 'EN_GRACIA':
      return {
        titulo: 'Vencida, dentro del margen',
        explicacion:
          'Tu gimnasio te deja unos dias de margen y todavia puedes entrar, pero la cuota ya ha vencido.',
        tono: 'aviso',
      };
    case 'VENCIDA':
      return {
        titulo: 'Vencida',
        explicacion: 'Habla con tu gimnasio para renovarla y volver a entrar.',
        tono: 'peligro',
      };
    case 'PAUSADA':
      return {
        titulo: 'Congelada',
        explicacion: 'Tu cuota esta congelada, asi que de momento no puedes entrar.',
        tono: 'neutro',
      };
    case 'SIN_SUSCRIPCION':
      return {
        titulo: 'Sin cuota',
        explicacion: 'No tienes ninguna cuota contratada en este gimnasio.',
        tono: 'neutro',
      };
  }
}

/**
 * Si hay que avisar de que la puerta puede no dejar pasar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ "CUOTA ACTIVA" Y "CODIGO VALIDO" NO SON LO MISMO, Y AQUI NO SE MEZCLAN. │
 * │                                                                          │
 * │ El servidor GENERA el codigo siempre que seas socio: no mira la cuota.   │
 * │ Quien decide si pasas es el escaner de la puerta, mirando el estado en   │
 * │ ese momento. Por eso la pantalla no dice nunca "acceso permitido" —no lo │
 * │ sabe— y por eso el boton de generar sigue disponible con la cuota        │
 * │ vencida: ocultarlo mentiria sobre donde esta la regla.                   │
 * │                                                                          │
 * │ Lo unico que se puede decir es que es PROBABLE que la puerta no deje     │
 * │ pasar, y se dice.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function avisaDeQueLaPuertaPuedeNegar(cuota: DuesStatus): boolean {
  return !cuota.puedeAcceder;
}

/**
 * Si el codigo que hay en memoria debe tirarse al volver a la pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI SONDEO NI GENERAR AL ENTRAR.                                         │
 * │                                                                          │
 * │ El codigo dura 60 segundos y se consume al escanearlo. Generarlo al      │
 * │ abrir la pestaña significaria que, para cuando alguien llega al torno,   │
 * │ ya esta caducado — y gastaria un token cada vez que se toca "Carne" sin  │
 * │ intencion de entrar. Se genera cuando la persona esta delante de la      │
 * │ puerta y pulsa.                                                          │
 * │                                                                          │
 * │ Lo unico automatico es TIRAR el caducado: al volver a la pantalla, un    │
 * │ codigo muerto no puede seguir a la vista como si sirviera.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function debeDescartarse(codigo: CodigoDeAcceso | null, ahora: number = Date.now()): boolean {
  return codigo !== null && segundosRestantes(codigo.expiresAt, ahora) === 0;
}
