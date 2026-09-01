import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import type { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icono } from './icono';
import { DESTINOS_DE_TABS } from '../navegacion/destinos';
import { tema } from '../tema';

/**
 * La barra de los cinco destinos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE NO ES LA BARRA POR DEFECTO.                                     │
 * │                                                                          │
 * │ Se probo primero con la de React Navigation, que es lo barato. Su celda  │
 * │ tiene un alto pensado para icono + texto y nada mas: al añadir el filete │
 * │ de activo —2 px y su separacion— el texto se salia y la celda medida se  │
 * │ quedaba en 32 px, por debajo de los 44 obligatorios. Se puede pelear con │
 * │ alturas fijas, pero fijar el alto total es justo como se acaba tapando   │
 * │ la barra de gestos del iPhone.                                          │
 * │                                                                          │
 * │ Asi que la barra se dibuja aqui: el alto lo pone el contenido, y debajo  │
 * │ se añade el inset real del dispositivo. Nada de numeros magicos.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL DESTINO ACTIVO SE DICE DE CUATRO FORMAS.                             │
 * │                                                                          │
 * │   1. el filete de acento encima del icono;                               │
 * │   2. el color del icono;                                                 │
 * │   3. el color del texto;                                                 │
 * │   4. el PESO del texto.                                                  │
 * │                                                                          │
 * │ Las cuatro funcionan por separado: quien no distingue el lima del gris   │
 * │ ve el filete y la negrita. Y un lector de pantalla recibe `selected`,    │
 * │ que no depende de ninguna de las cuatro.                                │
 * │                                                                          │
 * │ El filete existe SIEMPRE —transparente cuando no toca— para que el icono │
 * │ no salte al cambiar de pestaña.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
/**
 * El tipo se saca de `Tabs` en lugar de importarlo de
 * `@react-navigation/bottom-tabs`: expo-router lleva su PROPIA copia de esos
 * tipos y, para TypeScript, las dos no son la misma aunque describan lo mismo.
 * Derivarlo de aqui no puede desviarse, y ahorra una dependencia directa.
 */
type PropsDeBarra = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function BarraDePestanas({ state, navigation }: PropsDeBarra) {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        estilos.barra,
        // El inset del dispositivo se SUMA al relleno; nunca lo sustituye. En
        // un telefono sin muesca inferior vale 0 y queda el relleno de siempre.
        { paddingBottom: tema.espacio.sm + insets.bottom },
      ]}
    >
      {state.routes.map((ruta, indice) => {
        const destino = DESTINOS_DE_TABS.find((d) => d.nombre === ruta.name);
        if (!destino) return null;

        const activo = state.index === indice;
        const color = activo ? tema.color.acento : tema.color.textoSecundario;

        return (
          <Pressable
            key={ruta.key}
            onPress={() => {
              // `navigate` y no `push`: volver a Inicio estando en Inicio no
              // debe apilar una segunda copia.
              const evento = navigation.emit({ type: 'tabPress', target: ruta.key, canPreventDefault: true });
              if (!activo && !evento.defaultPrevented) navigation.navigate(ruta.name);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            // Las dos, y no por duplicar: en un telefono el estado viaja por
            // `accessibilityState`, y react-native-web solo emite aria-selected
            // si se le pide asi. Sin esto, un lector de pantalla en web no dice
            // cual de las cinco esta seleccionada.
            aria-selected={activo}
            accessibilityLabel={destino.etiqueta}
            style={estilos.destino}
          >
            <View style={[estilos.filete, activo && estilos.fileteActivo]} />
            <Icono nombre={destino.icono} color={color} tamano={24} />
            <Text style={[estilos.etiqueta, activo && estilos.etiquetaActiva, { color }]}>
              {destino.etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    backgroundColor: tema.color.superficie,
    borderTopColor: tema.color.borde,
    borderTopWidth: 1,
    paddingTop: tema.espacio.sm,
  },
  destino: {
    flex: 1,
    // Por encima de 44 con el filete y el texto dentro, no por casualidad.
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tema.espacio.xs,
    // Apretado a proposito: cinco destinos con nombres en español tienen que
    // caber en 360 sin cortar ninguna palabra.
    paddingHorizontal: 2,
  },
  filete: { width: 18, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  fileteActivo: { backgroundColor: tema.color.acento },
  etiqueta: { ...tema.texto.meta, fontWeight: '500' },
  etiquetaActiva: { fontWeight: '700' },
});
