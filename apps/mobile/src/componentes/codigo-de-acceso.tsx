import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { caminoDe, matrizDe } from '../carne/matriz';
import { tema } from '../tema';

/**
 * El codigo que se enseña en la puerta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NEGRO SOBRE BLANCO. NADA DE LIMA AQUI.                                  │
 * │                                                                          │
 * │ Es el unico sitio de la app que no es oscuro, y es a proposito: los      │
 * │ escaneres esperan modulos oscuros sobre fondo claro, y muchos lectores   │
 * │ baratos —los de un torno— no invierten. Un QR lima sobre grafito se ve   │
 * │ precioso y se lee mal, y aqui lo que importa es que abra la puerta.      │
 * │                                                                          │
 * │ Blanco puro y negro puro: 21:1. Cualquier color de marca detras de los   │
 * │ modulos solo puede bajar de ahi.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL MARGEN NO ES ESTETICA: ES PARTE DEL CODIGO.                          │
 * │                                                                          │
 * │ La norma pide una zona en blanco de CUATRO modulos alrededor. Sin ella   │
 * │ el lector no encuentra donde empieza el codigo. Por eso el margen se     │
 * │ dibuja DENTRO del propio SVG y en modulos, no en pixeles: asi se escala  │
 * │ con el codigo y no depende del tamaño de la pantalla.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El camino lo calcula `caminoDe`, que no sabe de React: asi se puede probar
 * que un token hostil no se cuela en el SVG sin montar nada.
 */
export function CodigoDeAcceso({ token, lado }: { token: string; lado: number }) {
  const dibujo = useMemo(() => caminoDe(matrizDe(token)), [token]);

  return (
    <View
      style={[estilos.marco, { width: lado, height: lado }]}
      accessibilityRole="image"
      // Se dice QUE es, no que lleva dentro: leerle el token a nadie sirve de
      // nada, y ademas es una llave.
      accessibilityLabel="Codigo QR de acceso al gimnasio"
    >
      <Svg width={lado} height={lado} viewBox={`0 0 ${dibujo.lienzo} ${dibujo.lienzo}`}>
        <Rect x={0} y={0} width={dibujo.lienzo} height={dibujo.lienzo} fill="#FFFFFF" />
        <Path d={dibujo.d} fill="#000000" />
      </Svg>
    </View>
  );
}

/**
 * El hueco del codigo mientras no hay codigo.
 *
 * Mide EXACTAMENTE lo mismo, y por eso existe: si el hueco fuera mas pequeño,
 * al llegar el codigo la pantalla daria un salto y lo que hay debajo se
 * movería bajo el dedo de quien ya estaba pulsando.
 */
export function HuecoDelCodigo({ lado, children }: { lado: number; children?: React.ReactNode }) {
  return (
    <View style={[estilos.hueco, { width: lado, height: lado }]} accessibilityRole="none">
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  marco: {
    backgroundColor: '#FFFFFF',
    // Esquinas suaves en el marco, no en el codigo: recortar un QR lo rompe.
    borderRadius: tema.radio.tarjeta,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  hueco: {
    backgroundColor: tema.color.superficieAlta,
    borderColor: tema.color.borde,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: tema.radio.tarjeta,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tema.espacio.xl,
    gap: tema.espacio.md,
  },
});
