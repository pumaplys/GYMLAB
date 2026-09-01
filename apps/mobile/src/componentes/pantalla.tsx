import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tema } from '../tema';

/**
 * El marco de cualquier pantalla.
 *
 * Pone el fondo, respeta las zonas seguras —la muesca arriba, la barra de
 * gestos abajo— y decide si el contenido se desplaza. Nada mas: la navegacion
 * llegara cuando existan pantallas que navegar.
 */
export function Pantalla({
  children,
  desplazable = true,
}: {
  children: ReactNode;
  /** Una pantalla que cabe entera —el carne— no debe poder desplazarse. */
  desplazable?: boolean;
}) {
  return (
    <SafeAreaView style={estilos.raiz} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={tema.color.fondo} />
      {desplazable ? (
        <ScrollView
          style={estilos.flujo}
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[estilos.flujo, estilos.contenido]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: tema.color.fondo },
  flujo: { flex: 1 },
  contenido: {
    // Que el contenedor llegue al menos al alto de la pantalla: es lo que
    // permite que una pantalla separe un bloque final con un hueco flexible
    // en lugar de dejarlo pegado al anterior.
    flexGrow: 1,
    padding: tema.espacio.lg,
    gap: tema.espacio.lg,
    // Aire al final: sin esto, lo ultimo queda pegado al borde inferior y en un
    // telefono con gestos se toca sin querer.
    paddingBottom: tema.espacio.xxxl,
  },
});
