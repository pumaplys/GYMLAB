import type { AccessResult } from '@gymlab/contracts';
import { esTokenDeAcceso } from './logica';

/**
 * El ciclo del escaneo, sin React y sin camara.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CAMARA LEE EL MISMO QR MUCHAS VECES POR SEGUNDO.                      │
 * │                                                                          │
 * │ `onBarcodeScanned` se dispara en CADA fotograma en el que el codigo sea  │
 * │ legible. Un carne delante del objetivo durante dos segundos son decenas  │
 * │ de llamadas con el mismo texto.                                          │
 * │                                                                          │
 * │ Sin filtro, la primera consumiria el `jti` y todas las demas caerian     │
 * │ fuera de la ventana de reintento del servidor: la pantalla acabaria      │
 * │ enseñando `TOKEN_REUSED` en rojo sobre un acceso que estuvo bien, y      │
 * │ ademas el historial del gimnasio se llenaria de intentos fantasma.       │
 * │                                                                          │
 * │ Y NO se replica la regla del servidor. La ventana de 3 s y el `isRetry`  │
 * │ son suyos. Lo unico que se hace aqui es no enviar dos veces lo mismo.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE UNA MAQUINA PURA Y NO TRES `useRef` EN LA PANTALLA.              │
 * │                                                                          │
 * │ Es la parte que hay que poder probar de verdad: diez lecturas seguidas,  │
 * │ una lectura con la peticion en vuelo, la reactivacion despues de cerrar. │
 * │ Con la logica dentro del componente eso necesita montar la camara, que   │
 * │ en CI no existe — y un test que fingiera la camara probaria el fingido.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type FaseDelEscaner =
  /** Camara viva, esperando un codigo. */
  | { tipo: 'leyendo' }
  /** Hay una peticion en vuelo. */
  | { tipo: 'verificando' }
  /** El servidor respondio. Se queda hasta que alguien lo cierra. */
  | { tipo: 'resultado'; resultado: AccessResult }
  /** No hubo respuesta utilizable: red, servidor caido, contrato roto. */
  | { tipo: 'fallo'; mensaje: string };

export interface EstadoDelEscaner {
  fase: FaseDelEscaner;
  /**
   * El ultimo token que se ENVIO.
   *
   * Vive aqui y en ningun sitio mas: no va a SecureStore, no se escribe en
   * ningun registro y no se enseña en pantalla. Es memoria de trabajo para no
   * repetir el envio, y muere con la pantalla.
   */
  ultimoEnviado: string | null;
}

export const ESTADO_INICIAL: EstadoDelEscaner = {
  fase: { tipo: 'leyendo' },
  ultimoEnviado: null,
};

export type Suceso =
  /** La camara ha decodificado algo. Cualquier cosa. */
  | { tipo: 'leido'; texto: string }
  | { tipo: 'respondio'; resultado: AccessResult }
  | { tipo: 'fallo'; mensaje: string }
  /** Quien esta en el mostrador cierra el veredicto y vuelve a escanear. */
  | { tipo: 'cerrar' };

/**
 * ¿Se manda este texto al servidor?
 *
 * Tres condiciones, todas necesarias:
 *
 *   1. la pantalla esta LEYENDO — ni con una peticion en vuelo, ni con un
 *      veredicto delante que nadie ha cerrado todavia;
 *   2. el texto tiene forma de carne de RINDA, no es un QR cualquiera;
 *   3. no es el mismo que se acaba de enviar.
 */
export function debeEnviar(texto: string, estado: EstadoDelEscaner): boolean {
  if (estado.fase.tipo !== 'leyendo') return false;
  const limpio = texto.trim();
  if (!esTokenDeAcceso(limpio)) return false;
  return limpio !== estado.ultimoEnviado;
}

/**
 * El siguiente estado. Devuelve EL MISMO objeto cuando no hay que hacer nada,
 * que es lo que permite comprobar en un test que una lectura se ignoro de
 * verdad y no que se volvio a montar un estado identico.
 */
export function siguiente(estado: EstadoDelEscaner, suceso: Suceso): EstadoDelEscaner {
  switch (suceso.tipo) {
    case 'leido': {
      if (!debeEnviar(suceso.texto, estado)) return estado;
      return { fase: { tipo: 'verificando' }, ultimoEnviado: suceso.texto.trim() };
    }

    case 'respondio':
      /*
       * Se CONSERVA `ultimoEnviado`. Al cerrar el veredicto, el carne puede
       * seguir delante del objetivo: sin esta memoria se reenviaria solo y el
       * servidor —correctamente— responderia `TOKEN_REUSED` sobre una entrada
       * que ya se habia contado bien.
       */
      return { ...estado, fase: { tipo: 'resultado', resultado: suceso.resultado } };

    case 'fallo':
      /*
       * Aqui SI se olvida, y es la diferencia importante con el caso de
       * arriba: si no hubo respuesta, el acceso no se decidio y la persona
       * sigue delante con el carne en la mano. Tiene que poder reintentarse el
       * MISMO codigo — todavia le queda vida.
       */
      return { fase: { tipo: 'fallo', mensaje: suceso.mensaje }, ultimoEnviado: null };

    case 'cerrar':
      if (estado.fase.tipo === 'leyendo' || estado.fase.tipo === 'verificando') return estado;
      return { ...estado, fase: { tipo: 'leyendo' } };
  }
}

/**
 * ¿La camara tiene que estar mirando ahora mismo?
 *
 * Se apaga tambien mientras hay un veredicto en pantalla: no hay nada que leer
 * y mantenerla encendida gasta bateria y calienta el telefono en el mostrador.
 */
export function camaraActiva(estado: EstadoDelEscaner, enPrimerPlano: boolean): boolean {
  return enPrimerPlano && estado.fase.tipo === 'leyendo';
}
