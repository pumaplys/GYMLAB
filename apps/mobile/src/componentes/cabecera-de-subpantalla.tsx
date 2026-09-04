import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icono } from './icono';
import { destinoAlVolver } from '../navegacion/destinos';
import { tema } from '../tema';

/**
 * El encabezado de una pantalla apilada sobre Perfil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CABECERA PROPIA, NO LA DE REACT NAVIGATION.                             │
 * │                                                                          │
 * │ La de la libreria trae su fondo, su tipografia, su altura y su flecha,   │
 * │ y ninguna de las cuatro es la del tema: al lado de `Pantalla` se ve que  │
 * │ son de dos aplicaciones distintas. Es la misma decision que se tomo en   │
 * │ M3 con `headerShown: false` para las pestañas.                          │
 * │                                                                          │
 * │ Asi que aqui va el titulo con el mismo carril de acento que el resto, y  │
 * │ el volver como una fila mas del tema.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `router.back()` Y NO `router.push('/perfil')`.                          │
 * │                                                                          │
 * │ Volver es deshacer, no navegar: con `push` cada vuelta apilaria otra     │
 * │ pantalla y el gesto de atras del sistema —que sigue existiendo— acabaria │
 * │ recorriendo un historial que no se parece a lo que hizo la persona.      │
 * │                                                                          │
 * │ Si no hay a donde volver —alguien abre /perfil/pagos con un enlace       │
 * │ directo— se va a Perfil, que es su sitio.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function CabeceraDeSubpantalla({ titulo, descriptor }: { titulo: string; descriptor?: string }) {
  // La decision vive en `navegacion/destinos.ts`, sin React, para poder
  // probarla. Aqui solo queda ejecutarla.
  const volver = () => {
    if (destinoAlVolver(router.canGoBack()) === 'atras') router.back();
    else router.replace('/perfil');
  };

  return (
    <View style={estilos.bloque}>
      <Pressable
        onPress={volver}
        accessibilityRole="button"
        accessibilityLabel="Volver a Perfil"
        style={({ pressed }) => [estilos.volver, pressed && estilos.pulsado]}
      >
        <Icono nombre="volver" color={tema.color.textoSecundario} tamano={20} />
        <Text style={estilos.textoVolver}>Perfil</Text>
      </Pressable>

      <Text style={estilos.titulo} accessibilityRole="header">
        {titulo}
      </Text>
      <View style={estilos.carril}>
        <View style={estilos.carrilAcento} />
        <View style={estilos.carrilResto} />
      </View>
      {descriptor ? <Text style={estilos.descriptor}>{descriptor}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.md },
  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: tema.espacio.xs,
    // El area util llega a 44 aunque la flecha mida 20.
    minHeight: tema.controlAltoMinimo,
    paddingRight: tema.espacio.md,
  },
  pulsado: { opacity: 0.6 },
  textoVolver: { ...tema.texto.cuerpo, color: tema.color.textoSecundario },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  carril: { flexDirection: 'row', alignItems: 'center', height: 3 },
  carrilAcento: { width: 44, height: 3, borderRadius: 2, backgroundColor: tema.color.acento },
  carrilResto: { flex: 1, height: 1, backgroundColor: tema.color.borde },
  descriptor: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 22 },
});
