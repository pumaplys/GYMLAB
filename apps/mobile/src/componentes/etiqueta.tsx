import { StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';

export type TonoDeEtiqueta = 'neutro' | 'exito' | 'aviso' | 'peligro' | 'acento';

/**
 * Una pastilla de estado.
 *
 * El color acompana al texto pero NO lo sustituye: "Al corriente" se lee igual
 * en escala de grises. Es la misma regla que sigue el panel web, y la razon es
 * la misma — hay quien no distingue el verde del rojo.
 */
export function Etiqueta({ children, tono = 'neutro' }: { children: string; tono?: TonoDeEtiqueta }) {
  return (
    <View style={[estilos.pastilla, fondos[tono]]}>
      <Text style={[estilos.texto, textos[tono]]} accessibilityRole="text">
        {children}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  pastilla: {
    alignSelf: 'flex-start',
    paddingHorizontal: tema.espacio.md,
    paddingVertical: tema.espacio.xs,
    borderRadius: tema.radio.pastilla,
    borderWidth: 1,
  },
  texto: { ...tema.texto.meta, fontWeight: '600' },
});

// Fondo translucido del propio color: sobre superficie oscura da un tinte
// suficiente sin inventar doce colores nuevos en la paleta.
const fondos = StyleSheet.create({
  neutro: { backgroundColor: tema.color.superficieAlta, borderColor: tema.color.borde },
  exito: { backgroundColor: 'rgba(50,213,131,0.12)', borderColor: 'rgba(50,213,131,0.35)' },
  aviso: { backgroundColor: 'rgba(253,176,34,0.12)', borderColor: 'rgba(253,176,34,0.35)' },
  peligro: { backgroundColor: 'rgba(249,112,102,0.12)', borderColor: 'rgba(249,112,102,0.35)' },
  acento: { backgroundColor: 'rgba(163,255,18,0.12)', borderColor: 'rgba(163,255,18,0.35)' },
});

const textos = StyleSheet.create({
  neutro: { color: tema.color.textoSecundario },
  exito: { color: tema.color.exito },
  aviso: { color: tema.color.aviso },
  peligro: { color: tema.color.peligro },
  acento: { color: tema.color.acento },
});
