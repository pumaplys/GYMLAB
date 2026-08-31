import { StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';

/**
 * Un numero con su nombre. La pieza que hace que una pantalla se lea de un
 * vistazo en lugar de leerse entera.
 *
 * El ROTULO va debajo en cuerpo pequeno y el VALOR arriba en grande: es al
 * reves de como se escribe un formulario, y a proposito. Quien mira el peso o
 * los dias que le quedan busca la cifra, no la palabra.
 *
 * La unidad se separa del numero y se atenua para que "78,6" siga siendo lo
 * que pesa visualmente, no "78,6 kg" entero.
 */
export function Dato({
  valor,
  unidad,
  etiqueta,
  destacado = false,
}: {
  valor: string;
  unidad?: string;
  etiqueta: string;
  /** En lima. Para el dato que ES la pantalla, no para todos. */
  destacado?: boolean;
}) {
  return (
    <View
      style={estilos.bloque}
      accessible
      accessibilityRole="text"
      // Un lector de pantalla lee una sola frase con sentido en lugar de tres
      // trozos sueltos: "Peso, 78,6 kilogramos".
      accessibilityLabel={`${etiqueta}: ${valor}${unidad ? ` ${unidad}` : ''}`}
    >
      <View style={estilos.fila}>
        <Text style={[estilos.valor, destacado && estilos.destacado]}>{valor}</Text>
        {unidad ? <Text style={estilos.unidad}>{unidad}</Text> : null}
      </View>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.xs },
  fila: { flexDirection: 'row', alignItems: 'baseline', gap: tema.espacio.xs },
  valor: { ...tema.texto.dato, color: tema.color.texto },
  destacado: { color: tema.color.acento },
  unidad: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  etiqueta: {
    ...tema.texto.meta,
    color: tema.color.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
