import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CarrilDeAcento } from './carril';
import { tema } from '../tema';

/**
 * El marco de cualquier pantalla.
 *
 * Pone el fondo, respeta las zonas seguras —la muesca arriba, la barra de
 * gestos abajo— y decide si el contenido se desplaza.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ENCABEZADO ES OPCIONAL Y SON DOS CADENAS, NO UN COMPONENTE APARTE.    │
 * │                                                                          │
 * │ Las cinco areas del socio comparten la misma cabecera: un titulo y una    │
 * │ frase corta debajo, con el carril de acento entre medias. Escribirla      │
 * │ suelta en cada pantalla es como cinco pantallas acaban con cinco tamanos  │
 * │ de titulo distintos.                                                     │
 * │                                                                          │
 * │ Y se queda en DOS props. Una pantalla que necesite una cabecera especial  │
 * │ —el Carne, con su codigo— no pasa `titulo` y se la dibuja: es mejor eso   │
 * │ que un componente con veinte props para cubrir el caso raro.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * No lleva relleno para la barra de pestañas: la barra NO flota, ocupa su
 * sitio, y el contenido se dispone encima. Ver `(tabs)/_layout.tsx`.
 */
export function Pantalla({
  children,
  titulo,
  descriptor,
  desplazable = true,
  alRefrescar,
  refrescando = false,
  sinRellenoHorizontal = false,
}: {
  children: ReactNode;
  titulo?: string;
  descriptor?: string;
  /** Una pantalla que cabe entera —el carne— no debe poder desplazarse. */
  desplazable?: boolean;
  /**
   * Tirar hacia abajo para recargar.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ ES `RefreshControl` DE REACT NATIVE. SIN LIBRERIA.                    │
   * │                                                                        │
   * │ Viene en el nucleo, lo entiende el gesto nativo de cada plataforma y   │
   * │ ya es accesible: el lector de pantalla anuncia el estado de recarga    │
   * │ sin que haya que etiquetarlo. Solo se le pasan los colores del tema,   │
   * │ porque el suyo por defecto es un indicador claro sobre fondo oscuro.   │
   * │                                                                        │
   * │ Opcional: una pantalla que no lo pase no gana el gesto, y ninguna lo   │
   * │ hereda por accidente.                                                 │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  alRefrescar?: () => void;
  refrescando?: boolean;
  /**
   * Quita el margen lateral del contenido, no del encabezado.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ ES PARA LAS TIRAS QUE SE ARRASTRAN DE BORDE A BORDE.                  │
   * │                                                                        │
   * │ El selector de medidas de Progreso es un `ScrollView` horizontal: si   │
   * │ empieza y acaba a 16 px del borde, parece una fila que cabe entera y   │
   * │ nadie la arrastra. Cortada por el borde se ve que sigue.               │
   * │                                                                        │
   * │ La pantalla que lo pida se encarga de dar su propio margen al resto    │
   * │ del contenido. El encabezado lo conserva siempre, para que el titulo   │
   * │ quede alineado con el de las otras cuatro pantallas.                   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  sinRellenoHorizontal?: boolean;
}) {
  const cuerpo = (
    <>
      {titulo ? (
        <View style={[estilos.encabezado, sinRellenoHorizontal && estilos.margenPropio]}>
          <Text style={estilos.titulo} accessibilityRole="header">
            {titulo}
          </Text>
          <CarrilDeAcento />
          {descriptor ? <Text style={estilos.descriptor}>{descriptor}</Text> : null}
        </View>
      ) : null}
      {children}
    </>
  );

  return (
    <SafeAreaView style={estilos.raiz} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={tema.color.fondo} />
      {desplazable ? (
        <ScrollView
          style={estilos.flujo}
          contentContainerStyle={[estilos.contenido, sinRellenoHorizontal && estilos.sinLados]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            alRefrescar ? (
              <RefreshControl
                refreshing={refrescando}
                onRefresh={alRefrescar}
                tintColor={tema.color.acento}
                colors={[tema.color.acento]}
                progressBackgroundColor={tema.color.superficie}
              />
            ) : undefined
          }
        >
          {cuerpo}
        </ScrollView>
      ) : (
        <View style={[estilos.flujo, estilos.contenido, sinRellenoHorizontal && estilos.sinLados]}>
          {cuerpo}
        </View>
      )}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: tema.color.fondo },
  flujo: { flex: 1 },
  contenido: {
    // Que el contenedor llegue al menos al alto de la pantalla: es lo que
    // permite que una pantalla separe un bloque final con un hueco flexible
    // en lugar de dejarlo pegado al anterior.
    flexGrow: 1,
    padding: tema.espacio.lg,
    gap: tema.espacio.lg,
    // Aire al final: sin esto, lo ultimo queda pegado al borde inferior y en un
    // telefono con gestos se toca sin querer.
    paddingBottom: tema.espacio.xxxl,
  },
  encabezado: { gap: tema.espacio.md },
  sinLados: { paddingHorizontal: 0 },
  margenPropio: { paddingHorizontal: tema.espacio.lg },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  descriptor: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 22 },
});
