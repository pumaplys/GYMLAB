import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Marca } from './marca';
import { CarrilDeAcento } from './carril';
import { tema } from '../tema';

/**
 * El marco de las pantallas de acceso: las que se ven ANTES de tener sesion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NACE PORQUE AHORA SON CUATRO, NO UNA.                                   │
 * │                                                                          │
 * │ Entrar, recuperar el acceso, elegir contraseña nueva y aceptar una       │
 * │ invitacion comparten exactamente el mismo marco: la marca arriba, el     │
 * │ contenido centrado, y el manejo del teclado. Copiarlo cuatro veces       │
 * │ garantiza que dentro de dos meses haya cuatro versiones distintas de     │
 * │ como se aparta el teclado.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL TECLADO TAPA JUSTO EL BOTON QUE HAY QUE PULSAR.                      │
 * │                                                                          │
 * │ `padding` en iOS y `height` en Android son los dos comportamientos que   │
 * │ funcionan en cada plataforma; no es una preferencia. Y el `ScrollView`   │
 * │ con `keyboardShouldPersistTaps="handled"` es lo que permite llegar al    │
 * │ boton desplazando cuando la pantalla es pequeña — sin el, en un iPhone   │
 * │ SE con el teclado abierto el boton queda fuera y no hay forma de darle.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function PantallaDeAcceso({
  titulo,
  entradilla,
  children,
  conMarca = false,
}: {
  titulo?: string;
  entradilla?: string;
  children: ReactNode;
  /** La marca solo la lleva la puerta principal. Las demas llevan titulo. */
  conMarca?: boolean;
}) {
  return (
    <SafeAreaView style={estilos.raiz} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={tema.color.fondo} />
      <KeyboardAvoidingView
        style={estilos.flexible}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={estilos.cabecera}>
            {conMarca ? <Marca /> : null}
            {titulo ? (
              <Text style={estilos.titulo} accessibilityRole="header">
                {titulo}
              </Text>
            ) : null}
            {titulo ? <CarrilDeAcento /> : null}
            {entradilla ? <Text style={estilos.entradilla}>{entradilla}</Text> : null}
          </View>

          <View style={estilos.cuerpo}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: tema.color.fondo },
  flexible: { flex: 1 },
  contenido: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: tema.espacio.xl,
    gap: tema.espacio.xxl,
  },
  cabecera: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  entradilla: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 24 },
  cuerpo: { gap: tema.espacio.lg },
});
