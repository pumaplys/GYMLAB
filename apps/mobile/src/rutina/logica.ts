/**
 * Las decisiones de Rutina, sin React y sin red.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL MODELO REAL, AUDITADO EN CONTRATO, API, BASE DE DATOS Y FIXTURE.     │
 * │                                                                          │
 * │ RUTINA (`OwnRoutine`)                                                    │
 * │   id, name, description|null, items[], status 'active'|'archived',       │
 * │   assignmentId, assignedAt                                               │
 * │                                                                          │
 * │ EJERCICIO (`RoutineItem`)                                                │
 * │   id, exerciseId|null, exerciseName, position, sets, reps, restSeconds,  │
 * │   notes                                                                  │
 * │                                                                          │
 * │ NO EXISTE, y por tanto no se dibuja: dia, bloque, semana, sesion,        │
 * │ ejercicio completado, peso realizado, RPE, temporizador, historico de    │
 * │ entrenamiento, y ninguna marca de rutina principal, actual o de hoy.     │
 * │                                                                          │
 * │ Tampoco viaja el grupo muscular ni el material: viven en `exercises` y   │
 * │ el item solo se lleva COPIADO el nombre.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { OwnRoutine, RoutineItem } from '@gymlab/contracts';

// --- Que se enseña -------------------------------------------------------

/**
 * En que estado esta la pantalla, en funcion de lo que hay y de lo que el
 * usuario esta mirando.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CON VARIAS RUTINAS NO SE ABRE NINGUNA SOLA.                             │
 * │                                                                          │
 * │ El servidor las ordena por `assigned_at DESC`, y en el fixture de        │
 * │ desarrollo las dos vigentes se asignaron con 127 milisegundos de         │
 * │ diferencia: el orden lo decidio un bucle de siembra, no un entrenador.   │
 * │ Abrir "la primera" seria presentar ese accidente como una decision.      │
 * │                                                                          │
 * │ Con varias se pide elegir. Con UNA se entra directamente, porque ahi no  │
 * │ hay nada que decidir.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type VistaDeRutina =
  | { tipo: 'sinRutinas' }
  | { tipo: 'eligiendo'; rutinas: readonly OwnRoutine[] }
  | {
      tipo: 'mirando';
      rutinas: readonly OwnRoutine[];
      mirada: OwnRoutine;
      /** Si hay mas de una, el selector se queda en pantalla para cambiar. */
      sePuedeCambiar: boolean;
    };

/**
 * La vista, derivada de los datos y del id que se esta mirando.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `rutinaSeleccionadaId` ES DE INTERFAZ. NO ES LA RUTINA ACTIVA DEL        │
 * │ SISTEMA.                                                                 │
 * │                                                                          │
 * │ Significa exactamente "la que el usuario esta mirando ahora mismo". No   │
 * │ se guarda, no se manda al servidor y no sobrevive a cerrar la app: el    │
 * │ backend no tiene donde apuntar eso, y fabricarle un sitio en el telefono │
 * │ convertiria un gesto de lectura en una decision de negocio que nadie ha  │
 * │ tomado.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Que sea DERIVADA y no un estado aparte es lo que resuelve el refresco: al
 * volver con datos nuevos, si la rutina mirada sigue estando se sigue
 * mirando, y si desaparecio se vuelve a la eleccion. Sin efectos, sin
 * sincronizar dos estados, y sin caer nunca en "pues le pongo la primera".
 */
export function vistaDeRutina(
  rutinas: readonly OwnRoutine[],
  rutinaSeleccionadaId: string | null,
): VistaDeRutina {
  if (rutinas.length === 0) return { tipo: 'sinRutinas' };

  if (rutinas.length === 1) {
    // Una sola: no hay eleccion que ofrecer, asi que no se ofrece.
    return {
      tipo: 'mirando',
      rutinas,
      mirada: rutinas[0] as OwnRoutine,
      sePuedeCambiar: false,
    };
  }

  const mirada = rutinas.find((r) => r.id === rutinaSeleccionadaId);
  if (!mirada) return { tipo: 'eligiendo', rutinas };

  return { tipo: 'mirando', rutinas, mirada, sePuedeCambiar: true };
}

// --- Los ejercicios ------------------------------------------------------

/**
 * Los ejercicios en su orden.
 *
 * El servidor ya los entrega ordenados por `position` —lo hace la consulta— y
 * aun asi se ordena aqui: `position` ES la rutina, y depender del orden de una
 * respuesta para algo que cambia lo que hay que hacer en el gimnasio no sale
 * gratis si alguna vez cambia esa consulta.
 */
export function ejerciciosEnOrden(rutina: OwnRoutine): readonly RoutineItem[] {
  return [...rutina.items].sort((a, b) => a.position - b.position);
}

/**
 * El numero que se pinta al lado del ejercicio: "01", "02"… "10".
 *
 * Se numera por la POSICION EN LA LISTA y no por `position`, que es un entero
 * de la base de datos: hoy vale 1, 2, 3… porque el servicio lo reescribe al
 * guardar, pero lo que el socio necesita es "voy por el cuarto", no el
 * identificador de orden interno.
 *
 * Dos digitos hasta el 99 para que la columna no baile entre el 9 y el 10.
 */
export function numeroDeEjercicio(indice: number): string {
  return String(indice + 1).padStart(2, '0');
}

/** Un numero con su rotulo, listo para pintar. */
export interface DatoDeEjercicio {
  /** Lo que se ve en grande. */
  valor: string;
  /** El rotulo corto, en mayusculas, que cabe a 360 px. */
  etiqueta: string;
  /** La frase entera que oye un lector de pantalla. Nunca un numero suelto. */
  lectura: string;
  /** Series y repeticiones mandan; el descanso acompaña. */
  principal: boolean;
}

/**
 * Los numeros de un ejercicio, en el orden en que se buscan.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `reps` ES TEXTO, NO UN ENTERO. ESTA COMPROBADO EN DATOS REALES.         │
 * │                                                                          │
 * │ El contrato lo declara `z.string().trim().min(1).max(30)` y la columna    │
 * │ es `text`. En el fixture de desarrollo ya conviven "8", "10", "12",      │
 * │ "15" y "8-10". El modelo admite ademas "al fallo" o "30 s por lado".     │
 * │                                                                          │
 * │ Por eso no se formatea ni se le añade unidad: se enseña lo que escribio  │
 * │ el entrenador. Y por eso el tamaño de letra se elige por longitud —ver   │
 * │ `tamanoDelValor`— en lugar de dar por hecho que caben dos digitos.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El descanso solo aparece si existe: `restSeconds` es anulable y en el
 * fixture hay ya un ejercicio sin el. Un "—" en su sitio no informa de nada y
 * ocupa una columna.
 */
export function datosDeEjercicio(item: RoutineItem): readonly DatoDeEjercicio[] {
  const datos: DatoDeEjercicio[] = [
    {
      valor: String(item.sets),
      etiqueta: 'SERIES',
      lectura: item.sets === 1 ? '1 serie' : `${item.sets} series`,
      principal: true,
    },
    {
      valor: item.reps,
      etiqueta: 'REPS',
      lectura: `${item.reps} repeticiones`,
      principal: true,
    },
  ];

  if (item.restSeconds !== null && item.restSeconds !== undefined) {
    datos.push({
      valor: `${item.restSeconds} s`,
      etiqueta: 'DESCANSO',
      lectura:
        item.restSeconds === 1
          ? '1 segundo de descanso'
          : `${item.restSeconds} segundos de descanso`,
      principal: false,
    });
  }

  return datos;
}

/**
 * El descanso, siempre igual de grande.
 *
 * Menor que las series y las repeticiones porque acompaña, y FIJO porque
 * "60 s" y "120 s" tienen que medir lo mismo: al medir la pantalla se vio que
 * con la escala por longitud el descanso saltaba de 28 a 22 entre un ejercicio
 * y el siguiente, y la columna bailaba al recorrer la lista.
 */
const TAMANO_DEL_DESCANSO = 20;

/**
 * El cuerpo de letra de un valor.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ESCALA POR LONGITUD EXISTE PORQUE `reps` ADMITE 30 CARACTERES.       │
 * │                                                                          │
 * │ Un "8" y un "al fallo por cada lado" son el mismo campo. Con un tamaño   │
 * │ fijo de 28, el segundo se sale de su columna a 360 px o parte la fila.   │
 * │                                                                          │
 * │ Solo se aplica a lo PRINCIPAL —series y repeticiones—, que es lo unico   │
 * │ que puede ser texto libre. El descanso es siempre "N s" y va fijo.       │
 * │                                                                          │
 * │ La escala baja por tramos y NO por debajo de 15: por debajo de ahi el    │
 * │ dato deja de leerse a un brazo de distancia, que es toda la razon de     │
 * │ ser de esta pantalla. Un texto muy largo se envuelve en dos lineas en    │
 * │ vez de encoger mas.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function tamanoDelValor(dato: Pick<DatoDeEjercicio, 'valor' | 'principal'>): number {
  if (!dato.principal) return TAMANO_DEL_DESCANSO;

  const largo = dato.valor.trim().length;
  if (largo <= 4) return 28;
  if (largo <= 7) return 22;
  if (largo <= 14) return 17;
  return 15;
}

/** "5 ejercicios", "1 ejercicio". Lo unico que se cuenta en esta pantalla. */
export function cuentaDeEjercicios(rutina: OwnRoutine): string {
  const n = rutina.items.length;
  return n === 1 ? '1 ejercicio' : `${n} ejercicios`;
}

// --- La carga ------------------------------------------------------------

export type EstadoDeCarga =
  | { fase: 'cargando' }
  | { fase: 'ok'; rutinas: readonly OwnRoutine[] }
  | { fase: 'fallo'; mensaje: string };
