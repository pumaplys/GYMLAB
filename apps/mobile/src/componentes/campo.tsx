import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { tema } from '../tema';

/**
 * Un campo de formulario.
 *
 * Nace ahora porque lo pide el login, no antes: es la primera pantalla que
 * tiene campos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ERROR NO SE DICE SOLO CON COLOR.                                      │
 * │                                                                          │
 * │ Un borde rojo no informa a quien no distingue el rojo, ni a quien usa un │
 * │ lector de pantalla. Por eso el error va ademas COMO TEXTO debajo, con    │
 * │ `accessibilityLiveRegion` para que se anuncie al aparecer, y el campo    │
 * │ lleva `accessibilityInvalid` para que el lector lo diga al enfocarlo.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Campo({
  etiqueta,
  valor,
  alCambiar,
  error,
  ayuda,
  deshabilitado = false,
  secreto = false,
  ...resto
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  error?: string;
  ayuda?: string;
  deshabilitado?: boolean;
  /** Contrasena: oculta el texto y ofrece el boton de mostrar. */
  secreto?: boolean;
} & Pick<
  TextInputProps,
  'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'textContentType' | 'returnKeyType' | 'onSubmitEditing' | 'autoCorrect'
>) {
  const [enfocado, setEnfocado] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={estilos.bloque}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>

      <View
        style={[
          estilos.caja,
          enfocado && estilos.enfocada,
          !!error && estilos.conError,
          deshabilitado && estilos.inactiva,
        ]}
      >
        <TextInput
          {...resto}
          value={valor}
          onChangeText={alCambiar}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          editable={!deshabilitado}
          secureTextEntry={secreto && !visible}
          placeholderTextColor={tema.color.textoSecundario}
          style={estilos.entrada}
          accessibilityLabel={etiqueta}
          accessibilityHint={ayuda}
          // Lo que hace que un lector anuncie "no valido" al enfocar el campo.
          aria-invalid={!!error}
          aria-disabled={deshabilitado}
        />

        {secreto ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            disabled={deshabilitado}
            style={estilos.ojo}
            accessibilityRole="button"
            // El nombre dice lo que VA A PASAR al pulsar, no el estado actual.
            accessibilityLabel={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          >
            <Text style={estilos.textoOjo}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={estilos.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : ayuda ? (
        <Text style={estilos.ayuda}>{ayuda}</Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.sm },
  // Micro-tipografia en versales con espaciado: es el mismo recurso que ya
  // usan 'SOCIO' y 'GIMNASIO ACTIVO' en sesion-lista, y le da al formulario
  // un aire de ficha tecnica en lugar de formulario de alta.
  // El texto se escribe en minusculas y se sube por ESTILO: el nombre que
  // recibe un lector de pantalla sigue siendo 'Correo', no 'CORREO'.
  etiqueta: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tema.color.textoSecundario,
  },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: tema.controlAltoMinimo,
    backgroundColor: tema.color.superficie,
    borderColor: tema.color.borde,
    borderWidth: 1,
    borderRadius: tema.radio.campo,
    paddingLeft: tema.espacio.lg,
  },
  // El foco se marca con el acento: es el mismo color que dice "esto es tuyo".
  enfocada: { borderColor: tema.color.acento },
  conError: { borderColor: tema.color.peligro },
  inactiva: { opacity: 0.5 },
  entrada: {
    flex: 1,
    // Sin esto el input reclama el ancho de su contenido y empuja al boton de
    // mostrar fuera de la caja: a 360 px desbordaba 3 px. Es la regla de
    // min-width:auto de flexbox, que react-native-web si aplica.
    minWidth: 0,
    // El alto lo pone la caja; el input solo necesita respirar dentro.
    paddingVertical: tema.espacio.md,
    ...tema.texto.cuerpo,
    color: tema.color.texto,
  },
  ojo: {
    // Cuadrado y del alto minimo: se pulsa con el pulgar sin apuntar.
    // 44 de ancho y de alto pase lo que pase: el objetivo tactil no se negocia
    // para hacer sitio. Lo que se aprieta es el relleno, no el area.
    minWidth: tema.controlAltoMinimo,
    minHeight: tema.controlAltoMinimo,
    paddingHorizontal: tema.espacio.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoOjo: { ...tema.texto.meta, fontWeight: '600', color: tema.color.textoSecundario },
  error: { ...tema.texto.meta, color: tema.color.peligro },
  ayuda: { ...tema.texto.meta, color: tema.color.textoSecundario },
});
