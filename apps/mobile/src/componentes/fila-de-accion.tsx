import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icono, type NombreDeIcono } from './icono';
import { tema } from '../tema';

/**
 * Una fila que lleva a otro sitio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NACE PORQUE INICIO LA PIDE TRES VECES.                                  │
 * │                                                                          │
 * │ Abrir el carne, ver la rutina y ver el progreso son el mismo gesto con   │
 * │ tres contenidos. Escribirlo tres veces es como acaban tres filas con     │
 * │ tres alturas distintas.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `principal` la convierte en LA accion de la pantalla: fondo de acento y
 * texto casi negro. Solo una por pantalla — el componente no puede impedirlo,
 * asi que queda escrito aqui.
 */
export function FilaDeAccion({
  titulo,
  detalle,
  icono,
  principal = false,
  alPulsar,
  accessibilityHint,
}: {
  titulo: string;
  detalle?: string;
  icono: NombreDeIcono;
  principal?: boolean;
  alPulsar: () => void;
  accessibilityHint?: string;
}) {
  const color = principal ? tema.color.sobreAcento : tema.color.acento;

  return (
    <Pressable
      onPress={alPulsar}
      accessibilityRole="button"
      // El nombre accesible lleva las dos lineas: quien no ve la pantalla
      // necesita el detalle tanto como el titulo.
      accessibilityLabel={detalle ? `${titulo}. ${detalle}` : titulo}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        estilos.fila,
        principal ? estilos.principal : estilos.normal,
        pressed && (principal ? estilos.principalPulsada : estilos.normalPulsada),
      ]}
    >
      <Icono nombre={icono} color={color} tamano={24} />
      <View style={estilos.texto}>
        <Text style={[estilos.titulo, principal && estilos.tituloPrincipal]}>{titulo}</Text>
        {detalle ? (
          <Text style={[estilos.detalle, principal && estilos.detallePrincipal]}>{detalle}</Text>
        ) : null}
      </View>
      {/* La punta de flecha, mas apagada que el resto: señala, no compite. */}
      <Icono nombre="avanzar" color={principal ? tema.color.sobreAcento : tema.color.textoSecundario} tamano={20} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacio.lg,
    // Por encima de 44 con dos lineas dentro, no por casualidad.
    minHeight: 68,
    paddingHorizontal: tema.espacio.lg,
    paddingVertical: tema.espacio.md,
    borderRadius: tema.radio.tarjeta,
    borderWidth: 1,
  },
  normal: { backgroundColor: tema.color.superficie, borderColor: tema.color.borde },
  normalPulsada: { backgroundColor: tema.color.superficieAlta, borderColor: tema.color.acento },
  principal: { backgroundColor: tema.color.acento, borderColor: tema.color.acento },
  principalPulsada: {
    backgroundColor: tema.color.acentoPulsado,
    borderColor: tema.color.acentoPulsado,
  },

  texto: { flex: 1, gap: 2 },
  titulo: { ...tema.texto.cuerpo, fontWeight: '600', color: tema.color.texto },
  tituloPrincipal: { color: tema.color.sobreAcento, fontWeight: '700' },
  detalle: { ...tema.texto.meta, color: tema.color.textoSecundario },
  detallePrincipal: { color: tema.color.sobreAcento, opacity: 0.75 },
});
