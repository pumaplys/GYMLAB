import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Routine } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { Boton } from '../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { FilaDeAccion } from '../../../src/componentes/fila-de-accion';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { lineaDeRutina, ordenarRutinas } from '../../../src/entrenamiento/biblioteca';
import { cargarRutinas } from '../../../src/entrenamiento/fuente';
import { INICIO_DE_AREA, RUTAS_INTERNAS } from '../../../src/navegacion/destinos';
import { tema } from '../../../src/tema';

/**
 * Las rutinas del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TODAS LAS DEL GIMNASIO, NO SOLO LAS MIAS.                               │
 * │                                                                          │
 * │ El servicio no filtra por autor, y es a proposito: dos entrenadores      │
 * │ comparten la plantilla «Fuerza principiantes» y duplicarla por cada uno  │
 * │ no tendria sentido. `created_by_user_id` existe, pero solo decide quien  │
 * │ puede archivarla.                                                        │
 * │                                                                          │
 * │ Las archivadas se quedan abajo en vez de esconderse: siguen teniendo     │
 * │ socios que las siguieron, y en V1 no se desarchivan.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
type Carga = { fase: 'cargando' } | { fase: 'ok'; rutinas: Routine[] } | { fase: 'fallo' };

export default function Rutinas() {
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const casa = sesion.tipo === 'autenticado' ? INICIO_DE_AREA[sesion.area] : '/';

  const pedir = useCallback(async () => {
    if (!gymId) return;
    setCarga({ fase: 'cargando' });
    try {
      setCarga({ fase: 'ok', rutinas: ordenarRutinas(await cargarRutinas(gymId)) });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo' });
    }
  }, [gymId, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  return (
    <Pantalla alRefrescar={carga.fase === 'ok' ? () => void pedir() : undefined}>
      <CabeceraDeVuelta titulo="Rutinas" volverA={casa} etiquetaDeVuelta="Volver" />

      <Boton variante="primario" onPress={() => router.push(RUTAS_INTERNAS.rutinaNueva)}>
        Nueva rutina
      </Boton>

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar las rutinas. Inténtalo de nuevo.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <View style={estilos.lista}>
          {carga.rutinas.map((rutina) => (
            <FilaDeAccion
              key={rutina.id}
              titulo={rutina.name}
              detalle={lineaDeRutina(rutina)}
              icono="rutina"
              alPulsar={() => router.push(RUTAS_INTERNAS.rutinaDelPersonal(rutina.id))}
              accessibilityHint="Abre la rutina"
            />
          ))}
          {carga.rutinas.length === 0 ? (
            <Text style={estilos.vacio}>
              Todavía no hay rutinas. Crea la primera para poder asignársela a alguien.
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  lista: { gap: tema.espacio.sm },
  vacio: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 22 },
});
