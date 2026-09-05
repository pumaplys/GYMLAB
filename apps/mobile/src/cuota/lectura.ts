/**
 * Como se LEE el estado de la cuota. Sin React y sin red.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VIVE APARTE PORQUE LO USAN DOS PANTALLAS.                               │
 * │                                                                          │
 * │ Nacio dentro de `carne/logica.ts` en M4, cuando solo lo usaba el Carne. │
 * │ Inicio necesita las mismas seis frases, y dejarlo alli habria obligado a │
 * │ que Inicio importara del Carne —dos pantallas hermanas acopladas— o a    │
 * │ escribir las frases una tercera vez. Ya estan duplicadas en el panel     │
 * │ web y esa deuda esta anotada; una tercera copia no.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { DuesStatus } from '@gymlab/contracts';


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
        explicacion: 'Tu cuota está pagada y puedes entrenar.',
        tono: 'exito',
      };
    case 'POR_VENCER':
      return {
        titulo: 'Vence pronto',
        explicacion: 'Todavía puedes entrenar. Renuévala en tu gimnasio antes de que caduque.',
        tono: 'aviso',
      };
    case 'EN_GRACIA':
      return {
        titulo: 'Vencida, dentro del margen',
        explicacion:
          'Tu gimnasio te deja unos días de margen y todavía puedes entrar, pero la cuota ya ha vencido.',
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
        explicacion: 'Tu cuota está congelada, así que de momento no puedes entrar.',
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
