import { StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';

export type TonoDeEtiqueta = 'neutro' | 'exito' | 'aviso' | 'peligro' | 'acento';

/**
 * Una pastilla de estado.
 *
 * El color acompana al texto pero NO lo sustituye: "Al corriente" se lee igual
 * en escala de grises. Es la misma regla que sigue el panel web, y la razon es
 * la misma — hay quien no distingue el verde del rojo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ "neutro" NO ES LO MISMO QUE EL "informacion" DE `Aviso`. NO SE UNIFICAN. │
 * │                                                                          │
 * │ Los otros tres tonos —exito, aviso, peligro— si coinciden, y por eso     │
 * │ parece que falta unificar el cuarto. No falta:                           │
 * │                                                                          │
 * │   Etiqueta "neutro"      gris de texto secundario. Es la ausencia de     │
 * │                          significado: un dato que no es bueno ni malo.   │
 * │   Aviso "informacion"    filete en `secundario`, el turquesa. SI         │
 * │                          significa: "esto es una nota, leela".           │
 * │                                                                          │
 * │ Renombrar cualquiera de los dos al nombre del otro haria que una         │
 * │ pastilla sin significado se pintara como una nota, o al reves. La deuda  │
 * │ es de nombre y se queda: los dos nombres son correctos EN SU COMPONENTE. │
 * └──────────────────────────────────────────────────────────────────────────┘
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
  exito: { backgroundColor: tema.tinte.fondo('exito'), borderColor: tema.tinte.borde('exito') },
  aviso: { backgroundColor: tema.tinte.fondo('aviso'), borderColor: tema.tinte.borde('aviso') },
  peligro: { backgroundColor: tema.tinte.fondo('peligro'), borderColor: tema.tinte.borde('peligro') },
  acento: { backgroundColor: tema.tinte.fondo('acento'), borderColor: tema.tinte.borde('acento') },
});

const textos = StyleSheet.create({
  neutro: { color: tema.color.textoSecundario },
  exito: { color: tema.color.exito },
  aviso: { color: tema.color.aviso },
  peligro: { color: tema.color.peligro },
  acento: { color: tema.color.acento },
});
