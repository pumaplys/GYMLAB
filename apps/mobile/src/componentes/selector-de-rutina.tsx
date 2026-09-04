import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OwnRoutine } from '@gymlab/contracts';
import { cuentaDeEjercicios } from '../rutina/logica';
import { tema } from '../tema';

/**
 * Cual de tus rutinas estas mirando.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ FILAS, NO UN DESPLEGABLE Y NO UN CONTROL SEGMENTADO.                    │
 * │                                                                          │
 * │ Un desplegable esconde las opciones detras de un toque y es un gesto de  │
 * │ formulario web, no de una pantalla que se consulta de pie.               │
 * │                                                                          │
 * │ Un segmentado horizontal si cabria con los nombres del fixture           │
 * │ —"Fuerza principiantes" y "Movilidad de hombro", 19 caracteres cada uno— │
 * │ pero el contrato admite 120, y a 360 px de ancho dos pastillas de 120    │
 * │ caracteres no existen. La solucion no puede depender de que los nombres  │
 * │ sean cortos.                                                             │
 * │                                                                          │
 * │ Filas verticales: aguantan cualquier nombre, admiten dos rutinas o seis, │
 * │ y dejan sitio para decir cuantos ejercicios tiene cada una, que es       │
 * │ justo lo que ayuda a elegir.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ELEGIDA SE DISTINGUE SIN VER EL COLOR.                               │
 * │                                                                          │
 * │ Cuatro señales, y tres funcionan en blanco y negro: la BARRA lateral     │
 * │ (forma), la superficie mas clara (fondo), el nombre en blanco y en       │
 * │ negrita (peso) y la palabra "MIRANDO" escrita. El lima es la cuarta,     │
 * │ nunca la unica.                                                          │
 * │                                                                          │
 * │ Y `accessibilityState={{ selected }}` sobre un `radio`, para que un      │
 * │ lector de pantalla anuncie "seleccionado" en lugar de describir un       │
 * │ boton mas.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * NO dice cual es la principal, porque no hay ninguna: el modelo no tiene esa
 * marca. Dice cual estas mirando tu.
 */
export function SelectorDeRutina({
  rutinas,
  seleccionadaId,
  alElegir,
}: {
  rutinas: readonly OwnRoutine[];
  /** Nulo mientras no se ha elegido: entonces ninguna fila va marcada. */
  seleccionadaId: string | null;
  alElegir: (id: string) => void;
}) {
  return (
    <View
      style={estilos.grupo}
      accessibilityRole="radiogroup"
      accessibilityLabel="Elige que rutina quieres consultar"
    >
      {rutinas.map((rutina) => {
        const elegida = rutina.id === seleccionadaId;
        return (
          <Pressable
            key={rutina.id}
            onPress={() => alElegir(rutina.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: elegida }}
            // React Native Web NO traduce `accessibilityState.selected` a
            // `aria-checked` en un `radio`: se pone a mano, igual que la barra
            // de pestañas tuvo que poner su `aria-selected`. Medido: sin esto
            // el lector no anuncia cual esta elegida.
            aria-checked={elegida}
            accessibilityLabel={`${rutina.name}, ${cuentaDeEjercicios(rutina)}`}
            style={({ pressed }) => [
              estilos.fila,
              elegida && estilos.filaElegida,
              pressed && estilos.filaPulsada,
            ]}
          >
            <View style={[estilos.barra, elegida && estilos.barraElegida]} />
            <View style={estilos.texto}>
              {/*
                SIN `numberOfLines`. Con el limite a dos lineas, un nombre de
                los 120 caracteres que admite el contrato quedaba cortado —
                medido: 84 px de texto en una caja de 42— y elegir entre dos
                rutinas cuyo nombre no se ve entero no es elegir. La fila crece
                y ya esta: pasa una vez de cada mil y cuando pasa hace falta.
              */}
              <Text style={[estilos.nombre, elegida && estilos.nombreElegido]}>{rutina.name}</Text>
              <Text style={estilos.cuenta}>{cuentaDeEjercicios(rutina)}</Text>
            </View>
            {elegida ? <Text style={estilos.marca}>MIRANDO</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: tema.espacio.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacio.md,
    // El dedo manda: 44 aunque el nombre ocupe una linea.
    minHeight: tema.controlAltoMinimo,
    paddingRight: tema.espacio.lg,
    paddingVertical: tema.espacio.sm,
    borderRadius: tema.radio.campo,
    borderWidth: 1,
    borderColor: tema.color.borde,
    // La barra llega a los bordes: el relleno lo pone cada parte.
    overflow: 'hidden',
  },
  filaElegida: { backgroundColor: tema.color.superficie, borderColor: tema.color.acento },
  filaPulsada: { opacity: 0.7 },
  barra: { alignSelf: 'stretch', width: 3, backgroundColor: 'transparent' },
  barraElegida: { backgroundColor: tema.color.acento },
  texto: { flex: 1, gap: 2, paddingLeft: tema.espacio.md - 3 },
  nombre: { ...tema.texto.cuerpo, fontWeight: '600', color: tema.color.textoSecundario },
  nombreElegido: { color: tema.color.texto },
  cuenta: { ...tema.texto.meta, color: tema.color.textoSecundario },
  marca: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    color: tema.color.acento,
  },
});
