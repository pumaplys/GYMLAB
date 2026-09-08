import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { AssignedRoutine } from '@gymlab/contracts';
import { Aviso } from '../componentes/aviso';
import { Boton } from '../componentes/boton';
import { laSesionYaNoVale } from '../auth/politica';
import { terminarAsignacion } from './fuente';
import { RUTAS_INTERNAS } from '../navegacion/destinos';
import { tema } from '../tema';

/**
 * Las rutinas que sigue un socio, con lo que se puede hacer con ellas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA SOLA COPIA PARA LAS DOS FICHAS.                                     │
 * │                                                                          │
 * │ El dueño llega por `(panel)/socio/[id]` y el entrenador por              │
 * │ `(entrenador)/asignado/[id]`: dos rutas, dos gates y dos endpoints       │
 * │ distintos para cargar al socio. Pero lo que se puede HACER con sus       │
 * │ rutinas es lo mismo, y la API es la misma. Con una copia en cada         │
 * │ pantalla, una de las dos se quedaria atras.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TERMINAR NO BORRA: LE PONE FECHA DE FIN.                                │
 * │                                                                          │
 * │ Es lo que permite saber dentro de tres meses que rutina siguio alguien.  │
 * │ Por eso el boton dice «Terminar» y no «Quitar», y la confirmacion lo     │
 * │ explica: quien lee «quitar» piensa que desaparece.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function RutinasDelSocio({
  gymId,
  socioId,
  rutinas,
  puedeAsignar,
  descripcionDe,
  alCambiar,
  alCaducarSesion,
}: {
  gymId: string | null;
  socioId: string;
  /** `null` es «no se pudieron cargar», distinto de «no sigue ninguna». */
  rutinas: readonly AssignedRoutine[] | null;
  puedeAsignar: boolean;
  /** La segunda linea de cada rutina. La pone quien llama: no es la misma. */
  descripcionDe: (rutina: AssignedRoutine) => { titulo: string; detalle: string };
  /** Se llama al terminar una: quien llama vuelve a pedir la ficha. */
  alCambiar: () => void;
  alCaducarSesion: () => void;
}) {
  const [terminando, setTerminando] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function terminar(rutinaId: string) {
    if (!gymId || enCurso) return;
    setEnCurso(true);
    setError(null);
    try {
      await terminarAsignacion(gymId, rutinaId, socioId);
      setTerminando(null);
      alCambiar();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        alCaducarSesion();
        return;
      }
      setError('No pudimos terminarla. Inténtalo de nuevo.');
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <View style={estilos.bloque}>
      <Text style={estilos.rotulo}>Rutinas</Text>

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {rutinas === null ? (
        <Text style={estilos.texto}>No hemos podido cargar sus rutinas.</Text>
      ) : rutinas.length === 0 ? (
        <Text style={estilos.texto}>Todavía no sigue ninguna rutina.</Text>
      ) : (
        rutinas.map((rutina) => {
          const linea = descripcionDe(rutina);
          const confirmando = terminando === rutina.id;
          return (
            <View key={rutina.assignmentId} style={estilos.fila}>
              <Text style={estilos.titulo}>{linea.titulo}</Text>
              <Text style={estilos.detalle}>{linea.detalle}</Text>

              {puedeAsignar ? (
                confirmando ? (
                  <View style={estilos.confirmar}>
                    <Text style={estilos.detalle}>
                      ¿Terminarla? Dejará de seguirla desde hoy. Queda registrado que la siguió.
                    </Text>
                    <Boton
                      variante="peligro"
                      onPress={() => void terminar(rutina.id)}
                      cargando={enCurso}
                      deshabilitado={enCurso}
                    >
                      Sí, terminar
                    </Boton>
                    <Boton onPress={() => setTerminando(null)} deshabilitado={enCurso}>
                      Que siga
                    </Boton>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setTerminando(rutina.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Terminar ${linea.titulo}`}
                    style={({ pressed }) => [estilos.terminar, pressed && estilos.pulsado]}
                  >
                    <Text style={estilos.textoTerminar}>Terminar</Text>
                  </Pressable>
                )
              ) : null}
            </View>
          );
        })
      )}

      {puedeAsignar ? (
        <Boton onPress={() => router.push(RUTAS_INTERNAS.asignarA(socioId))}>Asignar rutina</Boton>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.md },
  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tema.color.textoSecundario,
  },
  fila: { gap: tema.espacio.xs },
  titulo: { ...tema.texto.cuerpo, color: tema.color.texto },
  detalle: { ...tema.texto.meta, color: tema.color.textoSecundario, lineHeight: 18 },
  texto: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  confirmar: { gap: tema.espacio.sm, paddingTop: tema.espacio.sm },
  terminar: {
    alignSelf: 'flex-start',
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
  },
  textoTerminar: { ...tema.texto.secundario, color: tema.tinte.borde('peligro') },
  pulsado: { opacity: 0.6 },
});
