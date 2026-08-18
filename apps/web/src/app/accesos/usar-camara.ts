'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  arrancar,
  soltarStream,
  type EntornoDeArranque,
  type Lector,
  type StreamMinimo,
} from './camara-logica';
import { FORMATOS_DEL_DETECTOR, MS_ENTRE_LECTURAS } from './escaner-logica';

/**
 * La cámara del mostrador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI SOLO QUEDA EL PEGAMENTO DE REACT.                                   │
 * │                                                                          │
 * │ Las decisiones —cerrar la anterior antes de abrir otra, elegir lector,   │
 * │ soltar cada pista, qué hacer si falla el permiso— viven en               │
 * │ `camara-logica.ts`, sin React ni navegador, porque ahí se pueden mirar.  │
 * │ Este fichero se limita a traducir el navegador real a ese contrato.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE HAY DOS CAMINOS DE LECTURA.                                      │
 * │                                                                          │
 * │ `BarcodeDetector` no existe en Safari ni en Firefox. Sin alternativa,    │
 * │ ahi solo quedaba teclear el codigo — y el token son ~118 caracteres de   │
 * │ base64 que caducan en 60 segundos. Nadie dicta eso en un mostrador: el   │
 * │ campo manual no era un respaldo, era un callejon sin salida.             │
 * │                                                                          │
 * │ `jsqr` se descarga con `import()` SOLO cuando falta el detector nativo,  │
 * │ asi que Chrome y Android no reciben ni un byte de mas.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface DetectorNativo {
  detect(fuente: unknown): Promise<{ rawValue: string }[]>;
}
type ConstructorDeDetector = new (opciones: { formats: readonly string[] }) => DetectorNativo;

function detectorNativoDisponible(): (() => DetectorNativo) | null {
  if (typeof window === 'undefined') return null;
  const global = window as unknown as { BarcodeDetector?: ConstructorDeDetector };
  const Detector = global.BarcodeDetector;
  return Detector ? () => new Detector({ formats: FORMATOS_DEL_DETECTOR }) : null;
}

/** El lienzo donde se vuelca cada fotograma para que `jsqr` lo mire. */
function crearLienzo() {
  const lienzo = document.createElement('canvas');
  // `willReadFrequently`: se lee el buffer en cada pasada, y sin esta pista el
  // navegador mantiene el lienzo en la GPU y cada lectura obliga a traerlo.
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  if (!contexto) return null;

  return {
    pintar(fuente: unknown) {
      const video = fuente as HTMLVideoElement;
      const ancho = video.videoWidth;
      const alto = video.videoHeight;
      if (!ancho || !alto) return null;

      lienzo.width = ancho;
      lienzo.height = alto;
      contexto.drawImage(video, 0, 0, ancho, alto);
      const imagen = contexto.getImageData(0, 0, ancho, alto);
      return { datos: imagen.data, ancho, alto };
    },
  };
}

export type EstadoDeCamara = 'lista' | 'encendida' | 'no-soportada' | 'denegada';
export type ModoDeLectura = Lector['modo'] | null;

export function usarCamara(alLeer: (texto: string) => void) {
  const [estado, setEstado] = useState<EstadoDeCamara>('lista');
  const [modo, setModo] = useState<ModoDeLectura>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<StreamMinimo | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vivo = useRef(false);
  /*
   * La callback en una ref y no en las dependencias del efecto: cambia en cada
   * render —es una funcion nueva— y si el efecto dependiera de ella, la camara
   * se apagaria y encenderia sola en cada pintado.
   */
  const alLeerRef = useRef(alLeer);
  alLeerRef.current = alLeer;

  const apagar = useCallback(() => {
    vivo.current = false;
    if (temporizador.current !== null) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    soltarStream(stream.current);
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setModo(null);
    setEstado((previo) => (previo === 'encendida' ? 'lista' : previo));
  }, []);

  // Al desmontar, siempre. Es la unica garantia si alguien navega a otra ruta.
  useEffect(() => apagar, [apagar]);

  const encender = useCallback(async () => {
    const entorno: EntornoDeArranque = {
      streamAnterior: stream.current,
      detectorNativo: detectorNativoDisponible(),
      cargarJsqr: async () => (await import('jsqr')).default,
      crearLienzo,
      pedirCamara: () =>
        navigator.mediaDevices.getUserMedia({
          // `environment`: en una tablet de mostrador interesa la camara de
          // atras, que es la que se orienta hacia el movil del socio.
          video: { facingMode: 'environment' },
        }),
    };

    const resultado = await arrancar(entorno);
    stream.current = null;

    if (resultado.estado !== 'encendida') return void setEstado(resultado.estado);

    stream.current = resultado.stream;
    if (video.current) {
      video.current.srcObject = resultado.stream as MediaStream;
      await video.current.play();
    }
    vivo.current = true;
    setModo(resultado.lector.modo);
    setEstado('encendida');

    const mirar = async () => {
      if (!vivo.current) return;
      const elemento = video.current;
      // `readyState` bajo significa que aún no hay fotograma que analizar.
      if (elemento && elemento.readyState >= 2) {
        try {
          const texto = await resultado.lector.leer(elemento);
          // El filtro de repeticiones NO está aquí: lo decide `debeEnviar`,
          // compartido por los dos caminos y comprobable por separado.
          if (texto) alLeerRef.current(texto);
        } catch {
          // Un fotograma ilegible no es un error: el siguiente puede valer.
        }
      }
      if (!vivo.current) return;
      temporizador.current = setTimeout(() => void mirar(), MS_ENTRE_LECTURAS);
    };
    void mirar();
  }, []);

  return { estado, modo, video, encender, apagar };
}
