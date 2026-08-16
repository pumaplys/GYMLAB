import type { DuesStatus } from '@gymlab/contracts';

/**
 * Como se lee el estado de la cuota, sin React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE CALCULA NINGUN ESTADO. SOLO SE TRADUCE.                      │
 * │                                                                          │
 * │ El servidor ya resuelve `estado` teniendo en cuenta el huso horario del  │
 * │ gimnasio y sus dias de cortesia, que son configurables por gimnasio.     │
 * │ Deducirlo aqui a partir de `hasta` daria otro resultado en cuanto el     │
 * │ socio abriera la aplicacion desde otro pais — y el que estaria mal seria │
 * │ el de la pantalla.                                                       │
 * │                                                                          │
 * │ Lo unico que se hace es poner en castellano lo que ya viene decidido.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Como se presenta cada estado. El tono no es decorativo: acompaña al texto. */
export interface LecturaDeCuota {
  titulo: string;
  /** Que significa para el socio, en una frase. */
  explicacion: string;
  tono: 'exito' | 'aviso' | 'peligro' | 'neutro';
}

/**
 * Traduce el estado a algo que se entienda sin saber como funciona el sistema.
 *
 * NO DICE QUE HACER PARA PAGAR, y no es un olvido: hoy no se puede pagar desde
 * GYMLAB. Mandar a alguien a "renovar aqui" seria un boton que no existe, asi
 * que se le dice que hable con su gimnasio, que es lo que de verdad resuelve.
 */
export function lecturaDe(cuota: DuesStatus): LecturaDeCuota {
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
      // Existe porque cada gimnasio configura sus dias de cortesia: no es un
      // limbo, es una decision suya que ya viene aplicada.
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
 * Los dias que quedan, dichos como se dicen.
 *
 * `diasRestantes` es negativo cuando ya vencio, y "quedan -3 dias" no lo dice
 * nadie. Devuelve `null` cuando no hay nada que contar.
 */
export function diasEnPalabras(cuota: DuesStatus): string | null {
  const dias = cuota.diasRestantes;
  if (dias === null) return null;

  if (dias > 1) return `Quedan ${dias} dias`;
  if (dias === 1) return 'Queda 1 dia';
  if (dias === 0) return 'Vence hoy';
  if (dias === -1) return 'Vencio ayer';
  return `Vencio hace ${Math.abs(dias)} dias`;
}

/**
 * Si esto merece que el socio lo mire ahora.
 *
 * Se usa para ordenar la pantalla, no para inventar un estado: lo que no puede
 * pasar es que una cuota vencida quede debajo de un dato administrativo.
 */
export function requiereAtencion(cuota: DuesStatus): boolean {
  return !cuota.puedeAcceder || cuota.estado === 'POR_VENCER' || cuota.estado === 'EN_GRACIA';
}
