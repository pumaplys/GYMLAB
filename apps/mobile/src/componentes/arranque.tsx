import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';

/**
 * Lo que se ve mientras se comprueba si hay sesion.
 *
 * Deliberadamente sobria: es medio segundo de espera, no una pantalla de
 * bienvenida. Lleva el wordmark para que el arranque no sea un vacio negro y
 * para que el primer fotograma ya sea de la marca.
 */
export function Arranque() {
  return (
    <View style={estilos.raiz}>
      <Text style={estilos.marca}>GYMLAB</Text>
      <ActivityIndicator color={tema.color.acento} />
      <Text style={estilos.pie} accessibilityLiveRegion="polite">
        Comprobando tu sesion…
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: tema.color.fondo,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tema.espacio.lg,
  },
  marca: {
    ...tema.texto.display,
    color: tema.color.texto,
    letterSpacing: 4,
  },
  pie: { ...tema.texto.meta, color: tema.color.textoSecundario },
});
