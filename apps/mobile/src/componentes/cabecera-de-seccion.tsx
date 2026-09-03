import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icono } from './icono';
import { tema } from '../tema';

/**
 * El rotulo de una seccion, con su acción a la derecha.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUSTITUYE A UN BOTON DE ANCHO COMPLETO, Y ESE ES TODO EL PUNTO.         │
 * │                                                                          │
 * │ Inicio tenia "Ver mis rutinas" y "Ver progreso" como dos botones         │
 * │ secundarios a lo ancho. Dos botones grandes al final de la pantalla      │
 * │ pesan mas que el contenido que encabezan, y ademas duplican una          │
 * │ navegacion que la barra inferior ya ofrece.                              │
 * │                                                                          │
 * │ El enlace vive aqui arriba, pequeño y a la derecha. Pequeño de VISTA:    │
 * │ el area que se pulsa mide 44, que es lo que importa para el pulgar.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function CabeceraDeSeccion({
  titulo,
  accion,
  alPulsar,
  accessibilityHint,
}: {
  titulo: string;
  /** El texto del enlace. Sin el, la cabecera es solo un rotulo. */
  accion?: string;
  alPulsar?: () => void;
  accessibilityHint?: string;
}) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.titulo} accessibilityRole="header">
        {titulo}
      </Text>
      {accion && alPulsar ? (
        <Pressable
          onPress={alPulsar}
          accessibilityRole="button"
          accessibilityLabel={accion}
          accessibilityHint={accessibilityHint}
          style={({ pressed }) => [estilos.enlace, pressed && estilos.enlacePulsado]}
        >
          <Text style={estilos.textoEnlace}>{accion}</Text>
          <Icono nombre="avanzar" color={tema.color.acento} tamano={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // El alto lo pone el enlace, que manda: 44 aunque el texto mida 12.
    minHeight: tema.controlAltoMinimo,
    gap: tema.espacio.md,
  },
  titulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    color: tema.color.textoSecundario,
  },
  enlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacio.xs,
    // Se estira hasta el borde para que el area util llegue donde llega el
    // dedo, sin que el texto parezca desplazado.
    minHeight: tema.controlAltoMinimo,
    paddingLeft: tema.espacio.md,
  },
  enlacePulsado: { opacity: 0.6 },
  textoEnlace: { ...tema.texto.secundario, fontWeight: '600', color: tema.color.acento },
});
