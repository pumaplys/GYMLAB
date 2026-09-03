import { StyleSheet, Text, View } from 'react-native';
import type { RoutineItem } from '@gymlab/contracts';
import { datosDeEjercicio, numeroDeEjercicio, tamanoDelValor } from '../rutina/logica';
import { tema } from '../tema';

/**
 * Un ejercicio de la rutina.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES UNA FILA, NO UNA TARJETA. Y LA DIFERENCIA IMPORTA A LOS DIEZ.        │
 * │                                                                          │
 * │ Una rutina puede llevar hasta 50 ejercicios —lo fija el contrato— y una  │
 * │ tarjeta por ejercicio convierte eso en cincuenta cajas identicas: mucho  │
 * │ borde, mucho radio, mucha sombra y ninguna jerarquia. Lo que separa un   │
 * │ ejercicio del siguiente es una linea de 1 px y el aire de alrededor.     │
 * │                                                                          │
 * │ La unica superficie de la pantalla es la rutina elegida en el selector.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO SE MIRA. NO HAY NADA QUE MARCAR.                                   │
 * │                                                                          │
 * │ Sin casilla, sin circulo de completado, sin contador de series hechas y  │
 * │ sin barra de progreso. No es una decision de diseño: el producto no      │
 * │ tiene ese estado en ninguna parte —ni tabla, ni columna, ni endpoint—    │
 * │ asi que una casilla aqui seria un control que promete guardar algo y no  │
 * │ guarda nada.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Tampoco es pulsable: no existe pantalla de detalle de un ejercicio, y una
 * fila que responde al dedo sin llevar a ningun sitio se siente rota.
 */
export function EjercicioDeRutina({
  item,
  indice,
  primero = false,
}: {
  item: RoutineItem;
  /** La posicion en la lista, para el numero grande. */
  indice: number;
  /** El primero no lleva linea encima: ya la trae la cabecera de la rutina. */
  primero?: boolean;
}) {
  const datos = datosDeEjercicio(item);

  return (
    <View style={[estilos.fila, primero && estilos.filaPrimera]}>
      <View style={estilos.cabecera}>
        {/*
          El numero en lima: es lo que se busca para retomar el sitio despues
          de una serie, y es el unico acento por ejercicio. El NOMBRE se queda
          en blanco y mas grande, porque es lo que manda.

          `aria-hidden` no: el lector lo lee como parte del encabezado, que es
          justo lo que se quiere oir ("01, Press de banca").
        */}
        <Text style={estilos.numero}>{numeroDeEjercicio(indice)}</Text>
        {/*
          Si el gimnasio borro el ejercicio de su biblioteca, `exerciseId` es
          nulo y el nombre sobrevive copiado dentro de la rutina. Aqui no se
          nota ni se explica: al socio le sigue tocando hacerlo.
        */}
        <Text style={estilos.nombre} accessibilityRole="header">
          {item.exerciseName}
        </Text>
      </View>

      {/*
        Los numeros, con el valor arriba y el rotulo debajo.

        `flexWrap`: con unas repeticiones largas —el campo admite 30
        caracteres— el descanso baja a una segunda linea en vez de aplastar la
        fila. Ver `tamanoDelValor`.
      */}
      <View style={estilos.datos}>
        {datos.map((dato) => (
          <View
            key={dato.etiqueta}
            style={estilos.dato}
            accessible
            accessibilityRole="text"
            // Nunca un "4" suelto: el lector oye "4 series".
            accessibilityLabel={dato.lectura}
          >
            <Text
              style={[
                estilos.valor,
                { fontSize: tamanoDelValor(dato) },
                !dato.principal && estilos.valorSecundario,
              ]}
            >
              {dato.valor}
            </Text>
            <Text style={estilos.etiqueta}>{dato.etiqueta}</Text>
          </View>
        ))}
      </View>

      {/*
        La nota del entrenador. Si no hay, no se reserva sitio: ni el rotulo,
        ni el hueco. Un filete a la izquierda la separa sin meterla en una
        caja; puede llegar a 300 caracteres y sigue siendo un parrafo.
      */}
      {item.notes ? (
        <View style={estilos.nota}>
          <Text style={estilos.textoNota} accessibilityLabel={`Nota del entrenador: ${item.notes}`}>
            {item.notes}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * El ancho de la columna del numero.
 *
 * Fijo para que los nombres de los diez ejercicios empiecen en la misma
 * vertical: es lo que hace que la lista se recorra con el pulgar sin leerla.
 */
const COLUMNA_DEL_NUMERO = 32;
const SANGRADO = COLUMNA_DEL_NUMERO + tema.espacio.md;

const estilos = StyleSheet.create({
  fila: {
    paddingVertical: tema.espacio.md,
    gap: tema.espacio.md,
    borderTopWidth: 1,
    borderTopColor: tema.color.borde,
  },
  filaPrimera: { borderTopWidth: 0, paddingTop: 0 },
  cabecera: { flexDirection: 'row', alignItems: 'baseline', gap: tema.espacio.md },
  numero: {
    width: COLUMNA_DEL_NUMERO,
    fontSize: 20,
    fontWeight: '700',
    // Tabular no: no hay fuente propia todavia. El ancho fijo de la columna
    // hace el mismo trabajo de alinear.
    color: tema.color.acento,
  },
  nombre: { ...tema.texto.h2, flex: 1, color: tema.color.texto, lineHeight: 26 },
  datos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    marginLeft: SANGRADO,
    columnGap: tema.espacio.xl,
    rowGap: tema.espacio.md,
  },
  dato: { gap: 2 },
  valor: {
    fontWeight: '700',
    color: tema.color.texto,
    /*
     * Alto de linea FIJO, aunque el cuerpo cambie.
     *
     * Medido: con unas repeticiones de texto —"al fallo" a 17, "4" a 28— cada
     * valor ocupaba un alto distinto y los rotulos SERIES / REPS / DESCANSO
     * quedaban a tres alturas diferentes en la misma fila. Fijando la caja,
     * los rotulos se alinean solos.
     */
    lineHeight: 34,
  },
  // El descanso acompaña: mismo sitio, menos peso.
  valorSecundario: { color: tema.color.textoSecundario },
  etiqueta: {
    ...tema.texto.meta,
    fontWeight: '600',
    color: tema.color.textoSecundario,
    letterSpacing: 0.8,
  },
  nota: {
    marginLeft: SANGRADO,
    paddingLeft: tema.espacio.md,
    borderLeftWidth: 2,
    borderLeftColor: tema.color.borde,
  },
  textoNota: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },
});
