import { StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';

/**
 * El hueco de una pantalla que todavia no existe.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO PONE DATOS. NI DE MENTIRA, NI DE EJEMPLO, NI "APROXIMADOS".           │
 * │                                                                          │
 * │ Un marcador con una cifra inventada deja de ser un marcador: se enseña,  │
 * │ se comenta, y alguien acaba preguntando por que el numero no cuadra. Lo  │
 * │ unico que dice es que aqui va algo y cuando.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se borra entero en M4 y siguientes, cuando cada area tenga su pantalla.
 */
export function Marcador({ fase }: { fase: string }) {
  return (
    <View style={estilos.caja}>
      <Text style={estilos.etiqueta}>EN CONSTRUCCION</Text>
      <Text style={estilos.texto}>
        Esta seccion llega en {fase}. La navegacion ya funciona: puedes moverte entre las cinco.
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    borderColor: tema.color.borde,
    borderWidth: 1,
    // Discontinuo: se lee "provisional" sin necesidad de decirlo dos veces.
    borderStyle: 'dashed',
    borderRadius: tema.radio.tarjeta,
    padding: tema.espacio.lg,
    gap: tema.espacio.sm,
  },
  etiqueta: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    color: tema.color.textoSecundario,
  },
  texto: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },
});
