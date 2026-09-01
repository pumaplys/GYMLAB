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
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DESHABILITADO Y CARGANDO NO SON EL MISMO ESTADO, Y NINGUNO ES OPACIDAD.  │
 * │                                                                          │
 * │ La primera version bajaba la opacidad del boton entero. Sobre el fondo    │
 * │ oscuro, un lima al 45% no se ve "apagado": se vuelve #568119, un caqui    │
 * │ turbio que en la pantalla de login —donde los campos empiezan vacios— era │
 * │ el color dominante. La identidad de la marca la decidia un valor de       │
 * │ opacidad.                                                                │
 * │                                                                          │
 * │ Ahora cada estado tiene sus colores escritos:                            │
 * │                                                                          │
 * │   deshabilitado  superficie alta + texto secundario. Grafito, no lima     │
 * │                  sucio. Se lee "todavia no", no "lima estropeado".        │
 * │   cargando       SIGUE SIENDO LIMA. La accion esta en marcha y el boton   │
 * │                  no debe cambiar de identidad justo cuando mas se mira.   │
 * │                  Funcionalmente si esta bloqueado.                       │
 * │                                                                          │
 * │ El acento de la marca no se pierde con el formulario vacio: lo sostienen  │
 * │ el filete del titulo y la marca.                                         │
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
  // Bloqueado en los dos casos: es lo que evita el doble envio.
  const inactivo = deshabilitado || cargando;
  // Pero solo el deshabilitado cambia de aspecto. Cargando conserva el suyo.
  const apagado = deshabilitado && !cargando;

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
        apagado && estilosApagado[variante],
      ]}
    >
      {cargando ? (
        <ActivityIndicator
          color={variante === 'primario' ? tema.color.sobreAcento : tema.color.texto}
        />
      ) : (
        <Text
          style={[
            estilos.texto,
            variante === 'primario' && estilos.textoPrimario,
            apagado && estilos.textoApagado,
          ]}
        >
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
  texto: { ...tema.texto.cuerpo, fontWeight: '600', color: tema.color.texto },
  textoPrimario: { color: tema.color.sobreAcento },
  textoApagado: { color: tema.color.textoSecundario },
});

const estilosPulsado = StyleSheet.create({
  primario: { backgroundColor: tema.color.acentoPulsado, borderColor: tema.color.acentoPulsado },
  secundario: { backgroundColor: tema.color.superficieAlta },
  peligro: { backgroundColor: tema.color.superficie },
});

/** Un solo aspecto de "todavia no", igual para las tres variantes. */
const estilosApagado = StyleSheet.create({
  primario: { backgroundColor: tema.color.superficieAlta, borderColor: tema.color.borde },
  secundario: { backgroundColor: tema.color.superficieAlta, borderColor: tema.color.borde },
  peligro: { backgroundColor: 'transparent', borderColor: tema.color.borde },
});
