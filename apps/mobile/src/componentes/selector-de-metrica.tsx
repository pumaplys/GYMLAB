import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { CampoDeMedida, Medida } from '../progreso/logica';
import { tema } from '../tema';

/**
 * Que medida se esta mirando.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PASTILLAS EN UNA TIRA HORIZONTAL, Y NO UN DESPLEGABLE.                  │
 * │                                                                          │
 * │ El contrato tiene SIETE medidas —peso, grasa, pecho, cintura, cadera,    │
 * │ brazo, muslo— con nombres de una palabra. Siete pastillas cortas caben   │
 * │ en una tira que se arrastra con el pulgar; siete filas verticales        │
 * │ ocuparian media pantalla antes de llegar al dato.                        │
 * │                                                                          │
 * │ Es al reves que en Rutina, donde los nombres los escribe el gimnasio y   │
 * │ pueden medir 120 caracteres: aqui las etiquetas son NUESTRAS y son       │
 * │ cortas, asi que la tira es segura.                                       │
 * │                                                                          │
 * │ Solo aparecen las medidas que TIENEN datos. Ofrecer "Cadera" cuando      │
 * │ nadie ha medido una cadera es prometer una pantalla vacia.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ELEGIDA NO SE DISTINGUE SOLO POR EL COLOR.                           │
 * │                                                                          │
 * │ Tres señales: el fondo lleno —no un borde—, el texto en negrita, y       │
 * │ `accessibilityState.selected` con su `aria-selected` a mano, que React   │
 * │ Native Web no pone solo (medido en M6 con los `radio` de Rutina).        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function SelectorDeMetrica({
  medidas,
  elegida,
  alElegir,
}: {
  medidas: readonly Medida[];
  elegida: CampoDeMedida | null;
  alElegir: (campo: CampoDeMedida) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={estilos.marco}
      contentContainerStyle={estilos.tira}
      accessibilityRole="tablist"
      accessibilityLabel="Elige que medida quieres ver"
    >
      {medidas.map((medida) => {
        const activa = medida.campo === elegida;
        return (
          <Pressable
            key={medida.campo}
            onPress={() => alElegir(medida.campo)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}
            aria-selected={activa}
            accessibilityLabel={medida.etiqueta}
            style={({ pressed }) => [
              estilos.pastilla,
              activa && estilos.activa,
              pressed && estilos.pulsada,
            ]}
          >
            <Text style={[estilos.texto, activa && estilos.textoActivo]}>{medida.corta}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  // `flexGrow: 0`: dentro de una columna flexible, un `ScrollView` horizontal
  // sin alto se estira. Medido: con una sola medicion la tira ocupaba 369 px
  // de alto en vez de 44, y empujaba la cifra fuera de la primera pantalla.
  marco: { flexGrow: 0, flexShrink: 0 },
  // El relleno horizontal lo pone el contenedor: asi la primera pastilla queda
  // alineada con el resto de la pantalla y la ultima no se pega al borde.
  tira: { gap: tema.espacio.sm, paddingHorizontal: tema.espacio.lg, alignItems: 'center' },
  pastilla: {
    justifyContent: 'center',
    // 44 de alto util aunque la pastilla se vea mas baja.
    minHeight: tema.controlAltoMinimo,
    paddingHorizontal: tema.espacio.lg,
    borderRadius: tema.radio.pastilla,
    borderWidth: 1,
    borderColor: tema.color.borde,
  },
  activa: { backgroundColor: tema.color.acento, borderColor: tema.color.acento },
  pulsada: { opacity: 0.7 },
  texto: { ...tema.texto.secundario, fontWeight: '600', color: tema.color.textoSecundario },
  textoActivo: { color: tema.color.sobreAcento, fontWeight: '700' },
});
