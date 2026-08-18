/**
 * El ciclo de vida de la cámara, sin React y sin navegador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PRUEBA EL CONTRATO CON EL NAVEGADOR, NO EL HARDWARE.                  │
 * │                                                                          │
 * │ Que una cámara física se apague no lo puede comprobar CI, y fingir una   │
 * │ para afirmar que sí sería mentir con más pasos. Lo que sí se puede       │
 * │ comprobar —y es donde estaban los fallos— es que LLAMAMOS a lo que hay   │
 * │ que llamar: que se detiene CADA pista, que no se abre una segunda cámara │
 * │ sin cerrar la primera, y que un permiso denegado deja el camino manual   │
 * │ disponible en lugar de una pantalla rota.                                │
 * │                                                                          │
 * │ Por eso vive aquí y no dentro del hook: el paquete web no monta DOM a    │
 * │ propósito (ver `vitest.config.ts`), y esta es la misma solución que ya   │
 * │ usa `lib/areas.ts` — sacar la decisión de React para poder mirarla.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Lo mínimo que se necesita de un `MediaStream`. */
export interface StreamMinimo {
  getTracks(): { stop(): void }[];
}

/**
 * Detiene TODAS las pistas.
 *
 * Todas y no la primera: un stream de vídeo puede traer más de una, y dejar
 * una viva mantiene el indicador del dispositivo encendido — una cámara
 * grabando en el mostrador sin que nadie lo haya pedido.
 */
export function soltarStream(stream: StreamMinimo | null): void {
  for (const pista of stream?.getTracks() ?? []) pista.stop();
}

/** Un lector de códigos listo para usar. */
export interface Lector {
  modo: 'nativo' | 'jsqr';
  leer(fuente: unknown): Promise<string | null>;
}

/** Lo que `elegirLector` necesita del entorno. Se inyecta para poder probarlo. */
export interface EntornoDeLectura {
  /** El `BarcodeDetector` del navegador, o null si no existe. */
  detectorNativo: (() => { detect(f: unknown): Promise<{ rawValue: string }[]> }) | null;
  /**
   * Carga `jsqr` bajo demanda. Puede fallar: sin red, o el fichero no está.
   *
   * La firma se declara laxa a propósito: este módulo no importa `jsqr` —lo
   * haría entrar en el paquete inicial, que es justo lo que se evita— así que
   * describe lo que necesita en lugar de depender de sus tipos.
   */
  cargarJsqr: () => Promise<
    (
      datos: Uint8ClampedArray,
      ancho: number,
      alto: number,
      opciones: never,
    ) => { data: string } | null
  >;
  /** Prepara el lienzo donde se vuelcan los fotogramas, o null si no se puede. */
  crearLienzo: () => {
    pintar(fuente: unknown): { datos: Uint8ClampedArray; ancho: number; alto: number } | null;
  } | null;
}

/**
 * Decide CÓMO se van a leer los códigos en este navegador.
 *
 * Nativo si existe; si no, `jsqr` descargado en ese momento. `null` significa
 * que este navegador no puede leer y solo queda la entrada manual — con
 * `jsqr` en el respaldo, ese caso es prácticamente inalcanzable, pero no se
 * da por imposible: una descarga puede fallar.
 */
export async function elegirLector(entorno: EntornoDeLectura): Promise<Lector | null> {
  if (entorno.detectorNativo) {
    const detector = entorno.detectorNativo();
    return {
      modo: 'nativo',
      leer: async (fuente) => (await detector.detect(fuente))[0]?.rawValue ?? null,
    };
  }

  try {
    const jsQR = await entorno.cargarJsqr();
    const lienzo = entorno.crearLienzo();
    if (!lienzo) return null;

    return {
      modo: 'jsqr',
      leer: async (fuente) => {
        const imagen = lienzo.pintar(fuente);
        if (!imagen) return null;
        // `dontInvert`: los QR de GYMLAB son oscuros sobre claro. Pedirle que
        // pruebe también el negativo duplica el trabajo por fotograma.
        return (
          jsQR(imagen.datos, imagen.ancho, imagen.alto, {
            inversionAttempts: 'dontInvert',
          } as never)?.data ??
          null
        );
      },
    };
  } catch {
    // No se pudo descargar `jsqr`. La pantalla NO se rompe: queda la entrada
    // manual, que para soporte sigue sirviendo.
    return null;
  }
}

export type ResultadoDeArranque =
  | { estado: 'encendida'; stream: StreamMinimo; lector: Lector }
  | { estado: 'no-soportada' }
  | { estado: 'denegada' };

/** Lo que `arrancar` necesita del entorno. */
export interface EntornoDeArranque extends EntornoDeLectura {
  /** El stream que había antes, si lo había. */
  streamAnterior: StreamMinimo | null;
  pedirCamara: () => Promise<StreamMinimo>;
}

/**
 * Enciende la cámara, cerrando antes la que hubiera.
 *
 * El orden importa: **primero se suelta la anterior**. Pedir una segunda sin
 * cerrar la primera deja dos streams vivos, la cámara ocupada y el indicador
 * encendido para siempre — y en algunos dispositivos la segunda petición
 * falla directamente porque la cámara ya está en uso.
 */
export async function arrancar(entorno: EntornoDeArranque): Promise<ResultadoDeArranque> {
  soltarStream(entorno.streamAnterior);

  const lector = await elegirLector(entorno);
  if (!lector) return { estado: 'no-soportada' };

  try {
    return { estado: 'encendida', stream: await entorno.pedirCamara(), lector };
  } catch {
    // Permiso denegado, o no hay cámara. No es un fallo del programa.
    return { estado: 'denegada' };
  }
}
