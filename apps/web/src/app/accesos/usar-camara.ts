'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FORMATOS_DEL_DETECTOR } from './escaner-logica';

/**
 * La cámara del mostrador, si el navegador la ofrece.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TODO LO DEL NAVEGADOR VIVE AQUI, Y NADA MAS VIVE AQUI.                  │
 * │                                                                          │
 * │ `getUserMedia` y `BarcodeDetector` no se pueden probar en CI: harian      │
 * │ falta una cámara física y un QR delante. Aislarlos en este hook deja el   │
 * │ resto —qué se envía, qué se muestra, cuándo NO se reenvía— como funciones │
 * │ puras que sí se comprueban.                                              │
 * │                                                                          │
 * │ Fingir un `BarcodeDetector` en un test no demostraría que la cámara       │
 * │ funciona; demostraría que el fingido funciona.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `BarcodeDetector` NO está en Safari ni en Firefox. Por eso `disponible`
 * empieza en `null` —todavía no se sabe— y la entrada manual del escáner no es
 * un plan B: es el camino principal en media web.
 */

/** Lo mínimo del API que se usa. No existe en `lib.dom` todavía. */
interface DetectorDeCodigos {
  detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type ConstructorDeDetector = new (opciones: { formats: readonly string[] }) => DetectorDeCodigos;

function constructorDelDetector(): ConstructorDeDetector | null {
  if (typeof window === 'undefined') return null;
  const global = window as unknown as { BarcodeDetector?: ConstructorDeDetector };
  return global.BarcodeDetector ?? null;
}

export type EstadoDeCamara =
  /** Todavia no se ha comprobado si el navegador la soporta. */
  | 'comprobando'
  /** El navegador no trae `BarcodeDetector`: solo queda la entrada manual. */
  | 'no-soportada'
  /** Soportada, pero aun no se ha pedido permiso. */
  | 'lista'
  | 'encendida'
  /** La persona denego el permiso, o no hay camara conectada. */
  | 'denegada';

export function usarCamara(alLeer: (texto: string) => void) {
  const [estado, setEstado] = useState<EstadoDeCamara>('comprobando');
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const bucle = useRef<number | null>(null);
  /*
   * La callback en una ref y no en las dependencias del efecto: cambia en cada
   * render —es una funcion nueva— y si el efecto dependiera de ella, la camara
   * se apagaria y encenderia sola en cada pintado.
   */
  const alLeerRef = useRef(alLeer);
  alLeerRef.current = alLeer;

  useEffect(() => {
    setEstado(constructorDelDetector() ? 'lista' : 'no-soportada');
  }, []);

  /**
   * Suelta la cámara de verdad.
   *
   * Sin detener cada pista, el indicador del dispositivo se queda encendido
   * después de salir de la pantalla — y en el mostrador de un gimnasio eso es
   * una cámara grabando sin que nadie lo haya pedido.
   */
  const apagar = useCallback(() => {
    if (bucle.current !== null) {
      cancelAnimationFrame(bucle.current);
      bucle.current = null;
    }
    for (const pista of stream.current?.getTracks() ?? []) pista.stop();
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  // Al desmontar, siempre. Es la unica garantia si alguien navega a otra ruta.
  useEffect(() => apagar, [apagar]);

  const encender = useCallback(async () => {
    const Detector = constructorDelDetector();
    if (!Detector) return void setEstado('no-soportada');

    try {
      const medios = await navigator.mediaDevices.getUserMedia({
        // `environment`: en una tablet de mostrador interesa la cámara de
        // atrás, que es la que se puede orientar hacia el móvil del socio.
        video: { facingMode: 'environment' },
      });
      stream.current = medios;
      if (video.current) {
        video.current.srcObject = medios;
        await video.current.play();
      }
      setEstado('encendida');

      const detector = new Detector({ formats: FORMATOS_DEL_DETECTOR });
      const mirar = async () => {
        const elemento = video.current;
        // `readyState` bajo significa que aún no hay fotograma que analizar.
        if (elemento && elemento.readyState >= 2) {
          try {
            const codigos = await detector.detect(elemento);
            // El filtro de repeticiones NO está aquí: lo decide `debeEnviar`,
            // que es donde se puede comprobar.
            if (codigos[0]?.rawValue) alLeerRef.current(codigos[0].rawValue);
          } catch {
            // Un fotograma ilegible no es un error: el siguiente puede valer.
          }
        }
        bucle.current = requestAnimationFrame(() => void mirar());
      };
      bucle.current = requestAnimationFrame(() => void mirar());
    } catch {
      apagar();
      setEstado('denegada');
    }
  }, [apagar]);

  return { estado, video, encender, apagar };
}
