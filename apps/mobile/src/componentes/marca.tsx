import { StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';

/**
 * El wordmark, TEMPORAL.
 *
 * Tipografico y nada mas: ni isotipo, ni simbolo, ni marca dibujada. El
 * naming del producto sigue sin decidirse, asi que cualquier cosa que se
 * dibuje ahora habria que rehacerla. Una palabra con espaciado y un punto de
 * acento se cambia entera cambiando esta linea.
 *
 * El punto lima es lo unico que lo separa de un texto suelto, y es el mismo
 * recurso que se usa en el resto de la app: el acento marca lo que importa.
 */
export function Marca({ tamano = 'grande' }: { tamano?: 'grande' | 'pequeno' }) {
  return (
    <View style={estilos.fila} accessibilityRole="header" accessibilityLabel="GYMLAB">
      <Text style={[estilos.palabra, tamano === 'pequeno' && estilos.pequena]}>GYMLAB</Text>
      <View style={[estilos.punto, tamano === 'pequeno' && estilos.puntoPequeno]} />
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'flex-end', gap: tema.espacio.xs },
  palabra: {
    ...tema.texto.display,
    color: tema.color.texto,
    letterSpacing: 3,
  },
  pequena: { ...tema.texto.h3, letterSpacing: 2 },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tema.color.acento,
    marginBottom: 6,
  },
  puntoPequeno: { width: 5, height: 5, borderRadius: 3, marginBottom: 4 },
});
