import { StyleSheet, View } from 'react-native';
import { tema } from '../tema';

/**
 * El carril de acento que va bajo el titulo de una pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL UNICO GESTO GRAFICO DE LA APP, Y ESTABA ESCRITO CUATRO VECES.        │
 * │                                                                          │
 * │ `Pantalla`, `CabeceraDeSubpantalla`, el login y el selector de gimnasio  │
 * │ tenian los mismos tres estilos copiados byte a byte. Cuatro copias de un │
 * │ gesto de identidad es como acaba habiendo un carril de 40 px en una      │
 * │ pantalla y de 44 en las otras, sin que nadie lo decida.                  │
 * │                                                                          │
 * │ 44 px de acento y despues una linea de 1 px del color del borde hasta el │
 * │ final: el gesto arranca y se continua sin competir con el acento.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function CarrilDeAcento() {
  return (
    <View style={estilos.carril}>
      <View style={estilos.acento} />
      <View style={estilos.resto} />
    </View>
  );
}

const estilos = StyleSheet.create({
  carril: { flexDirection: 'row', alignItems: 'center', height: 3 },
  acento: { width: 44, height: 3, borderRadius: 2, backgroundColor: tema.color.acento },
  resto: { flex: 1, height: 1, backgroundColor: tema.color.borde },
});
