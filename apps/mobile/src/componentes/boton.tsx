import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { tema } from '../tema';

export type VarianteDeBoton = 'primario' | 'secundario' | 'peligro';

/**
 * El boton.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SOLO PRIMARIO LIMA POR PANTALLA.                                      │
 * │                                                                          │
 * │ `#A3FF12` sobre el fondo oscuro tiene un contraste altisimo, y eso lo    │
 * │ hace inmejorable para LA accion de la pantalla y agotador para cinco.    │
 * │ El componente no puede impedirlo —no sabe quienes son sus hermanos— asi  │
 * │ que queda escrito aqui: si una pantalla necesita dos botones lima, lo    │
 * │ que hace falta es decidir cual de los dos es el principal.               │
 * │                                                                          │
 * │ El texto del primario es CASI NEGRO, no blanco: blanco sobre lima no     │
 * │ llega a AA ni de lejos.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El alto minimo es `controlAltoMinimo` y no un valor de esta hoja: es la
 * misma regla de 44 px del panel web, y vive en el tema para que no pueda
 * desviarse en un componente y no en otro.
 */
export function Boton({
  children,
  onPress,
  variante = 'secundario',
  deshabilitado = false,
  cargando = false,
  accessibilityHint,
}: {
  children: string;
  onPress: () => void;
  variante?: VarianteDeBoton;
  deshabilitado?: boolean;
  cargando?: boolean;
  accessibilityHint?: string;
}) {
  const inactivo = deshabilitado || cargando;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      // El estado NO se anuncia solo con color: un lector de pantalla recibe
      // "deshabilitado" y "ocupado" de verdad.
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      accessibilityLabel={children}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        estilos.base,
        estilos[variante],
        pressed && !inactivo && estilosPulsado[variante],
        inactivo && estilos.inactivo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator
          color={variante === 'primario' ? tema.color.sobreAcento : tema.color.texto}
        />
      ) : (
        <Text style={[estilos.texto, variante === 'primario' && estilos.textoPrimario]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    minHeight: tema.controlAltoMinimo,
    paddingHorizontal: tema.espacio.lg,
    borderRadius: tema.radio.boton,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primario: { backgroundColor: tema.color.acento, borderColor: tema.color.acento },
  secundario: { backgroundColor: tema.color.superficie, borderColor: tema.color.borde },
  peligro: {
    // Contorno y no relleno: el rojo lleno para cada accion destructiva acaba
    // siendo ruido. El color dice "cuidado"; el texto dice que hace.
    backgroundColor: 'transparent',
    borderColor: tema.color.peligro,
  },
  inactivo: { opacity: 0.45 },
  texto: { ...tema.texto.cuerpo, fontWeight: '600', color: tema.color.texto },
  textoPrimario: { color: tema.color.sobreAcento },
});

const estilosPulsado = StyleSheet.create({
  primario: { backgroundColor: tema.color.acentoPulsado, borderColor: tema.color.acentoPulsado },
  secundario: { backgroundColor: tema.color.superficieAlta },
  peligro: { backgroundColor: tema.color.superficie },
});
