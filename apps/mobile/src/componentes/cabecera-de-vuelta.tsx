import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icono } from './icono';
import { CarrilDeAcento } from './carril';
import { destinoAlVolverA } from '../navegacion/destinos';
import { tema } from '../tema';

/**
 * El encabezado de una pantalla apilada, con su vuelta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CABECERA PROPIA, NO LA DE REACT NAVIGATION.                             │
 * │                                                                          │
 * │ La de la libreria trae su fondo, su tipografia, su altura y su flecha,   │
 * │ y ninguna de las cuatro es la del tema: al lado de `Pantalla` se ve que  │
 * │ son de dos aplicaciones distintas. Es la misma decision que se tomo en   │
 * │ M3 con `headerShown: false` para las pestañas.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `router.back()` Y NO `router.push(...)`.                                │
 * │                                                                          │
 * │ Volver es deshacer, no navegar: con `push` cada vuelta apilaria otra     │
 * │ pantalla y el gesto de atras del sistema —que sigue existiendo— acabaria │
 * │ recorriendo un historial que no se parece a lo que hizo la persona.      │
 * │                                                                          │
 * │ Si no hay a donde volver —alguien abre la pantalla con un enlace         │
 * │ directo— se REEMPLAZA por la pantalla que la contiene, que es su sitio.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Nace en STAFF-FINAL porque el Panel y el area del entrenador necesitan lo
 * mismo que Perfil con otro destino. `CabeceraDeSubpantalla` pasa a ser esta
 * con `/perfil` fijo, en vez de una segunda copia de los mismos estilos.
 */
export function CabeceraDeVuelta({
  titulo,
  descriptor,
  volverA,
  etiquetaDeVuelta,
}: {
  titulo: string;
  descriptor?: string;
  /** Donde se cae si no hay historial. */
  volverA: string;
  /** Como se llama ese sitio, para el boton y para el lector de pantalla. */
  etiquetaDeVuelta: string;
}) {
  // La decision vive en `navegacion/destinos.ts`, sin React, para poder
  // probarla. Aqui solo queda ejecutarla.
  const volver = () => {
    if (destinoAlVolverA(router.canGoBack(), volverA) === 'atras') router.back();
    else router.replace(volverA as never);
  };

  return (
    <View style={estilos.bloque}>
      <Pressable
        onPress={volver}
        accessibilityRole="button"
        accessibilityLabel={`Volver a ${etiquetaDeVuelta}`}
        style={({ pressed }) => [estilos.volver, pressed && estilos.pulsado]}
      >
        <Icono nombre="volver" color={tema.color.textoSecundario} tamano={20} />
        <Text style={estilos.textoVolver}>{etiquetaDeVuelta}</Text>
      </Pressable>

      <Text style={estilos.titulo} accessibilityRole="header">
        {titulo}
      </Text>
      <CarrilDeAcento />
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
  descriptor: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 22 },
});
