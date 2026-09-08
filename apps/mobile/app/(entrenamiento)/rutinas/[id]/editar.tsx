import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CreateRoutineInput, Exercise, Routine } from '@gymlab/contracts';
import { Aviso } from '../../../../src/componentes/aviso';
import { Boton } from '../../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../../src/auth/politica';
import { useSesion } from '../../../../src/auth/sesion';
import { EditorDeRutina } from '../../../../src/entrenamiento/editor-de-rutina';
import {
  actualizarRutina,
  cargarEjercicios,
  cargarRutina,
} from '../../../../src/entrenamiento/fuente';
import { RUTAS_INTERNAS } from '../../../../src/navegacion/destinos';
import { tema } from '../../../../src/tema';

/**
 * Editar una rutina.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE CARGAN LAS DOS COSAS ANTES DE PINTAR EL EDITOR, Y NO ES POR ESTETICA.│
 * │                                                                          │
 * │ Guardar REEMPLAZA la lista de ejercicios de la rutina. Si el editor se   │
 * │ montara con la rutina a medio cargar, su estado inicial serian cero      │
 * │ items — y guardar desde ahi no daria error: borraria la rutina entera    │
 * │ con un 200.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function EditarRutina() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [datos, setDatos] = useState<{ rutina: Routine; ejercicios: Exercise[] } | null>(null);
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    setFallo(false);
    try {
      const [rutina, ejercicios] = await Promise.all([
        cargarRutina(gymId, id),
        cargarEjercicios(gymId),
      ]);
      setDatos({ rutina, ejercicios });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setFallo(true);
    }
  }, [gymId, id, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function guardar(cambios: CreateRoutineInput) {
    if (!gymId || !id || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await actualizarRutina(gymId, id, cambios);
      router.replace(RUTAS_INTERNAS.rutinaDelPersonal(id));
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError('No pudimos guardar los cambios. Inténtalo de nuevo.');
      setGuardando(false);
    }
  }

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo={datos ? `Editar ${datos.rutina.name}` : 'Editar rutina'}
        volverA={id ? RUTAS_INTERNAS.rutinaDelPersonal(id) : RUTAS_INTERNAS.rutinas}
        etiquetaDeVuelta="Rutina"
      />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {fallo ? (
        <>
          <Aviso tono="peligro">No pudimos cargar la rutina.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {datos === null && !fallo ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {datos !== null ? (
        <EditorDeRutina
          rutina={datos.rutina}
          ejercicios={datos.ejercicios}
          guardando={guardando}
          etiquetaDeGuardar="Guardar cambios"
          onGuardar={(cambios) => void guardar(cambios)}
        />
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
});
