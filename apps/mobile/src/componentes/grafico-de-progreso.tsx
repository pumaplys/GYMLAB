import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import {
  caminoDe,
  comoNumero,
  coordenadasDe,
  cruzanAnios,
  dominioDe,
  referenciasDeTiempo,
  serieConstante,
  type Medida,
  type Punto,
} from '../progreso/logica';
import { fechaCortaDeInstante, fechaDeInstante } from '../formato/fecha';
import { tema } from '../tema';

/**
 * La evolucion de una medida.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN LIBRERIA DE GRAFICOS. UNA LINEA, UNOS PUNTOS Y CUATRO ROTULOS.      │
 * │                                                                          │
 * │ `react-native-svg` ya esta en el proyecto —lo usan los iconos desde      │
 * │ M3— y lo que hace falta es un `Path` y unos `Circle`. Victory,           │
 * │ react-native-chart-kit o gifted-charts traerian ejes configurables,      │
 * │ tooltips, animaciones y escalas d3 para dibujar seis puntos.             │
 * │                                                                          │
 * │ Sin cuadricula, sin area rellena, sin degradado y sin animacion: lo que  │
 * │ se viene a mirar es por donde va la linea, y todo lo demas es ruido      │
 * │ delante del dato.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL LECTOR DE PANTALLA NO DEPENDE DEL SVG.                               │
 * │                                                                          │
 * │ El grafico entero es UNA imagen con su descripcion —cuantas mediciones,  │
 * │ de cuando a cuando, y entre que valores— y nada mas: recorrer nueve      │
 * │ circulos uno a uno no informa a nadie.                                   │
 * │                                                                          │
 * │ El valor actual y el cambio viven ARRIBA, en texto de verdad, fuera de   │
 * │ este componente. Quien no ve el grafico no se pierde ningun dato.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function GraficoDeProgreso({
  puntos,
  medida,
  alto = ALTO_DEL_TRAZO,
}: {
  puntos: readonly Punto[];
  medida: Medida;
  alto?: number;
}) {
  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ EL ANCHO SE MIDE AQUI DENTRO, Y NO SE RECIBE DE FUERA.                │
   * │                                                                        │
   * │ La primera version lo recibia: la pantalla medía su columna —358 px a  │
   * │ 390— y se lo pasaba. Pero el lienzo no ocupa esa columna entera: a su  │
   * │ izquierda va la escala. Medido: el SVG salia 31 px por fuera de su     │
   * │ propia caja en las siete vistas con grafico.                          │
   * │                                                                        │
   * │ Midiendo la zona de trazado de verdad, el error no puede repetirse     │
   * │ aunque manaña cambie lo que hay alrededor.                             │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const [ancho, setAncho] = useState(0);
  const medirAncho = useCallback((e: LayoutChangeEvent) => {
    setAncho(e.nativeEvent.layout.width);
  }, []);

  // Con menos de dos puntos no hay evolucion que dibujar. Quien llama ya lo
  // sabe; esto es la red por si acaso, y evita un `Path` de un solo punto.
  if (puntos.length < 2) return null;

  const dominio = dominioDe(puntos);
  // El radio del punto se sale del lienzo en los extremos si no se deja sitio.
  const lienzoAncho = Math.max(ancho - RADIO * 2, 1);
  const lienzoAlto = Math.max(alto - RADIO * 2, 1);
  const coordenadas = coordenadasDe(puntos, lienzoAncho, lienzoAlto, dominio);
  const camino = caminoDe(coordenadas);
  const referencias = referenciasDeTiempo(puntos);

  /*
   * Si el rango cruza de año, los rotulos lo dicen. Y si todos los valores
   * son el mismo, la escala no se rotula: ver los dos comentarios de abajo.
   */
  const conAnio = cruzanAnios(puntos);
  const plana = serieConstante(puntos);

  const valores = puntos.map((p) => p.valor);
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);

  return (
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ EL GRAFICO ENTERO ES UN SOLO ELEMENTO PARA EL LECTOR.              │
     * │                                                                    │
     * │ `accessible` sobre el marco lo convierte en uno, y                 │
     * │ `importantForAccessibility="no-hide-descendants"` tapa el interior  │
     * │ en Android, donde `accessible` por si solo no basta.                │
     * │                                                                    │
     * │ Asi VoiceOver no recorre diez circulos, ni un `Path`, ni los        │
     * │ numeros sueltos de la escala —"75,6", "71,4"— que sin contexto no   │
     * │ dicen nada. Todo eso ya esta en la descripcion, y el valor y el     │
     * │ cambio viven arriba en texto de verdad.                             │
     * └────────────────────────────────────────────────────────────────────┘
     */
    <View
      style={estilos.marco}
      accessible
      accessibilityRole="image"
      accessibilityLabel={descripcion(puntos, medida, minimo, maximo)}
    >
      {/*
        Y lo de dentro se tapa: `accessibilityElementsHidden` en iOS,
        `importantForAccessibility` en Android. Sin esto el lector recorreria
        diez circulos, un camino, y los numeros sueltos de la escala —"75,6",
        "71,4"— que sin contexto no dicen nada.
      */}
      {/*
        ┌──────────────────────────────────────────────────────────────────┐
        │ CON TODOS LOS VALORES IGUALES NO SE ROTULA LA ESCALA.            │
        │                                                                  │
        │ Lo enseño una captura: la serie constante ponia "70" arriba y    │
        │ "70" abajo, y parecia una averia. La linea plana ES correcta —no │
        │ se le inventa pendiente— pero rotular dos veces el mismo numero  │
        │ no informa de nada.                                              │
        │                                                                  │
        │ Y tampoco se rotulan los limites del DOMINIO calculado: 67,9 y   │
        │ 72,1 son relleno matematico, no los midio nadie, y puestos en el │
        │ eje se leerian como mediciones que no existen.                   │
        │                                                                  │
        │ Asi que ahi no va nada: el valor esta arriba en grande, el       │
        │ cambio dice "Sin cambio" y la linea plana dice el resto.         │
        └──────────────────────────────────────────────────────────────────┘
      */}
      {plana ? null : (
        <View style={[estilos.escala, { height: alto }]} accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden>
          <Text style={estilos.rotuloEscala}>{comoNumero(maximo)}</Text>
          <Text style={estilos.rotuloEscala}>{comoNumero(minimo)}</Text>
        </View>
      )}

      <View
        style={estilos.zona}
        onLayout={medirAncho}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {/*
          Hasta que no se sabe el ancho no se dibuja: un SVG de ancho cero
          durante el primer fotograma es una linea aplastada que parpadea. Se
          reserva el alto para que la pagina no salte.
        */}
        {ancho > 0 ? (
          <Svg width={ancho} height={alto}>
            <Path
              d={camino}
              /*
               * `transform` y NO `translateX`/`translateY`.
               *
               * Con esas dos, react-native-svg en web las pasa tal cual al DOM
               * y React avisa de que no las reconoce: se veia en la consola de
               * la vista previa. Y peor que el aviso es lo que significa — que
               * el desplazamiento NO se aplicaba, asi que la linea quedaba
               * cuatro pixeles por encima y a la izquierda de sus puntos.
               *
               * El desplazamiento deja sitio al radio del punto por los cuatro
               * lados, que es lo que evita que los extremos se corten.
               */
              transform={`translate(${RADIO}, ${RADIO})`}
              stroke={tema.color.acento}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {coordenadas.map((c) => (
              <Circle
                key={c.punto.iso + c.punto.valor}
                cx={c.x + RADIO}
                cy={c.y + RADIO}
                r={RADIO}
                fill={tema.color.fondo}
                stroke={tema.color.acento}
                strokeWidth={2}
              />
            ))}
          </Svg>
        ) : (
          <View style={{ height: alto }} />
        )}

        {/*
          Las fechas: como mucho tres, y en texto de React Native y no en un
          `Text` de SVG. Asi respetan el tamaño de letra del sistema, que un
          texto dentro del SVG no hace.
        */}
        <View style={estilos.fechas}>
          {referencias.map((punto, i) => (
            <Text
              key={punto.iso}
              style={[
                estilos.fecha,
                i === 0 && estilos.fechaIzquierda,
                i === referencias.length - 1 && estilos.fechaDerecha,
              ]}
            >
              {conAnio ? fechaDeInstante(punto.iso) : fechaCortaDeInstante(punto.iso)}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

/** El alto del trazo. No del componente: debajo van las fechas. */
export const ALTO_DEL_TRAZO = 140;
const RADIO = 4;

/**
 * Lo que oye quien no ve el grafico.
 *
 * Dice CUANTAS mediciones, DE CUANDO A CUANDO y ENTRE QUE VALORES. No dice si
 * sube o si baja: eso ya esta arriba, en el cambio, y decirlo dos veces
 * empezaria a sonar a conclusion.
 */
function descripcion(
  puntos: readonly Punto[],
  medida: Medida,
  minimo: number,
  maximo: number,
): string {
  // Con el año cuando el rango lo cruza: "entre el 11 jun y el 24 ago" para
  // catorce meses seria la misma ambiguedad que tenian los rotulos del eje.
  const escribir = cruzanAnios(puntos) ? fechaDeInstante : fechaCortaDeInstante;
  const primera = escribir(puntos[0]!.iso);
  const ultima = escribir(puntos[puntos.length - 1]!.iso);
  return (
    `Gráfico de ${medida.etiqueta.toLowerCase()}: ${puntos.length} mediciones ` +
    `entre el ${primera} y el ${ultima}, ` +
    `de ${comoNumero(minimo)} a ${comoNumero(maximo)} ${medida.unidad}.`
  );
}

const estilos = StyleSheet.create({
  marco: { flexDirection: 'row', gap: tema.espacio.sm },
  escala: { justifyContent: 'space-between', alignItems: 'flex-end' },
  rotuloEscala: { ...tema.texto.meta, color: tema.color.textoSecundario },
  zona: { flex: 1, minWidth: 0, gap: tema.espacio.sm },
  fechas: { flexDirection: 'row', justifyContent: 'space-between' },
  fecha: { ...tema.texto.meta, color: tema.color.textoSecundario, flex: 1, textAlign: 'center' },
  fechaIzquierda: { textAlign: 'left' },
  fechaDerecha: { textAlign: 'right' },
});
