import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { CreateRoutineInput, Exercise } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { Boton } from '../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { EditorDeRutina } from '../../../src/entrenamiento/editor-de-rutina';
import { cargarEjercicios, crearRutina } from '../../../src/entrenamiento/fuente';
import { RUTAS_INTERNAS } from '../../../src/navegacion/destinos';
import { tema } from '../../../src/tema';

/** Crear una rutina nueva. */
export default function NuevaRutina() {
  const { estado: sesion, revisar } = useSesion();
  const [ejercicios, setEjercicios] = useState<Exercise[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId) return;
    setFallo(false);
    try {
      setEjercicios(await cargarEjercicios(gymId));
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setFallo(true);
    }
  }, [gymId, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function crear(datos: CreateRoutineInput) {
    if (!gymId || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const creada = await crearRutina(gymId, datos);
      // A la ficha de lo que se acaba de crear, no a la lista: lo siguiente
      // que se hace con una rutina nueva es asignarla o revisarla.
      router.replace(RUTAS_INTERNAS.rutinaDelPersonal(creada.id));
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError('No pudimos crear la rutina. Inténtalo de nuevo.');
      setGuardando(false);
    }
  }

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo="Nueva rutina"
        volverA={RUTAS_INTERNAS.rutinas}
        etiquetaDeVuelta="Rutinas"
      />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {fallo ? (
        <>
          <Aviso tono="peligro">
            No pudimos cargar la biblioteca de ejercicios, y sin ella no se puede montar una
            rutina.
          </Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {ejercicios === null && !fallo ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {ejercicios !== null ? (
        <EditorDeRutina
          ejercicios={ejercicios}
          guardando={guardando}
          etiquetaDeGuardar="Crear rutina"
          onGuardar={(datos) => void crear(datos)}
        />
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
});
