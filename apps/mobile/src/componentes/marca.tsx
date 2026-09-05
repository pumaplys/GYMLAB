import { Image, StyleSheet, View } from 'react-native';
import LOGO from '../../assets/logo.png';

/**
 * El logotipo de RINDA: el simbolo y la palabra, tal cual los entrego diseño.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES UNA IMAGEN, NO UNA PALABRA CON ESPACIADO.                            │
 * │                                                                          │
 * │ Antes era `<Text>RINDA</Text>` con un punto de acento, porque no habia   │
 * │ logotipo. Ahora lo hay, y una marca escrita con la fuente del sistema no │
 * │ es la marca: cambia de forma entre iOS y Android, y no lleva el simbolo. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL FICHERO ES EL DE `splash.png`, RECORTADO. NO ES OTRO DIBUJO.         │
 * │                                                                          │
 * │ `splash.png` es el lockup dentro de un lienzo cuadrado con mucho margen  │
 * │ transparente: usarlo aqui obligaria a adivinar cuanto hueco tiene para   │
 * │ darle un tamaño en pantalla. `logo.png` es exactamente ese dibujo con el │
 * │ margen quitado —600x445, sin fondo— asi que el ancho que se le pone es   │
 * │ el ancho que se ve.                                                      │
 * │                                                                          │
 * │ NO se usa `icon.png`: ese lleva el fondo grafito incrustado y aqui       │
 * │ apareceria como un cuadrado dentro de la pantalla.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Proporcion del fichero: 600 x 445. El alto se deriva, no se escribe. */
const PROPORCION = 600 / 445;

const ANCHOS = { grande: 168, pequeno: 104 } as const;

export function Marca({ tamano = 'grande' }: { tamano?: keyof typeof ANCHOS }) {
  const ancho = ANCHOS[tamano];

  return (
    <View
      style={estilos.marco}
      accessibilityRole="header"
      // El nombre lo pone el contenedor UNA vez. La imagen de dentro se
      // esconde: si no, un lector de pantalla diria "RINDA" dos veces.
      accessibilityLabel="RINDA"
    >
      <Image
        source={LOGO}
        style={{ width: ancho, height: ancho / PROPORCION }}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  marco: { alignSelf: 'flex-start' },
});
