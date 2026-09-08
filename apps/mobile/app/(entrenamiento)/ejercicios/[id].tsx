import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CreateExerciseInput, Exercise } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { Boton } from '../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { FormularioDeEjercicio } from '../../../src/entrenamiento/formulario-de-ejercicio';
import {
  actualizarEjercicio,
  cargarEjercicios,
  eliminarEjercicio,
} from '../../../src/entrenamiento/fuente';
import { RUTAS_INTERNAS } from '../../../src/navegacion/destinos';
import { tema } from '../../../src/tema';

/**
 * Editar un ejercicio, o quitarlo de la biblioteca.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO HAY ENDPOINT PARA UN EJERCICIO SUELTO.                               │
 * │                                                                          │
 * │ La API ofrece la biblioteca entera (`GET /exercises`) y nada mas: no hay │
 * │ `GET /exercises/:id`. Asi que se carga la lista y se busca dentro. No es │
 * │ un rodeo caro —la lista ya viaja de una vez— y no se inventa un endpoint │
 * │ que no existe.                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'ok'; ejercicio: Exercise }
  | { fase: 'noEsta' }
  | { fase: 'fallo' };

export default function EditarEjercicio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    setCarga({ fase: 'cargando' });
    try {
      const encontrado = (await cargarEjercicios(gymId)).find((e) => e.id === id);
      setCarga(encontrado ? { fase: 'ok', ejercicio: encontrado } : { fase: 'noEsta' });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo' });
    }
  }, [gymId, id, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function guardar(datos: CreateExerciseInput) {
    if (!gymId || !id || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await actualizarEjercicio(gymId, id, datos);
      router.replace(RUTAS_INTERNAS.ejercicios);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos guardar los cambios. Inténtalo de nuevo.',
      );
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!gymId || !id) return;
    setError(null);
    try {
      await eliminarEjercicio(gymId, id);
      router.replace(RUTAS_INTERNAS.ejercicios);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError('No pudimos borrarlo. Inténtalo de nuevo.');
      setBorrando(false);
    }
  }

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo={carga.fase === 'ok' ? carga.ejercicio.name : 'Ejercicio'}
        volverA={RUTAS_INTERNAS.ejercicios}
        etiquetaDeVuelta="Ejercicios"
      />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'noEsta' ? (
        <Aviso tono="aviso">Ese ejercicio ya no está en la biblioteca.</Aviso>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar el ejercicio.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <>
          <FormularioDeEjercicio
            ejercicio={carga.ejercicio}
            guardando={guardando}
            onGuardar={(datos) => void guardar(datos)}
          />

          {/*
            ┌────────────────────────────────────────────────────────────────┐
            │ BORRAR NO ROMPE LAS RUTINAS QUE LO USABAN, Y HAY QUE DECIRLO.  │
            │                                                                │
            │ La clave ajena es `SET NULL`: el item de la rutina conserva su  │
            │ nombre, sus series y sus notas, y queda marcado como que ya no  │
            │ esta en la biblioteca. Sin esta frase, borrar da mas miedo del  │
            │ que merece — y quien no se atreve acaba con la biblioteca llena │
            │ de ejercicios que no usa.                                       │
            └────────────────────────────────────────────────────────────────┘
          */}
          {borrando ? (
            <View style={estilos.confirmar}>
              <Text style={estilos.pregunta}>
                ¿Quitarlo de la biblioteca? Las rutinas que ya lo usaban lo conservan con su
                nombre, pero para editarlas habrá que sustituirlo.
              </Text>
              <Boton variante="peligro" onPress={() => void borrar()}>
                Sí, quitarlo
              </Boton>
              <Boton onPress={() => setBorrando(false)}>Dejarlo como está</Boton>
            </View>
          ) : (
            <Boton onPress={() => setBorrando(true)}>Quitar de la biblioteca</Boton>
          )}
        </>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  confirmar: { gap: tema.espacio.md },
  pregunta: { ...tema.texto.secundario, color: tema.color.texto, lineHeight: 22 },
});
