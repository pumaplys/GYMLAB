import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder de Fase 0. Solo verifica que la app arranca en el simulador
 * o en Expo Go. Se sustituye en Fase 1 por la navegacion real.
 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>GYMLAB</Text>
      <Text style={styles.subtitle}>Fase 0 — estructura del monorepo</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    opacity: 0.6,
  },
});
