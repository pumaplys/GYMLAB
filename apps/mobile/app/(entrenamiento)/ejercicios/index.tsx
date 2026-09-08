import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Aviso } from '../../../src/componentes/aviso';
import { Boton } from '../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Campo } from '../../../src/componentes/campo';
import { FilaDeAccion } from '../../../src/componentes/fila-de-accion';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { filtrarEjercicios, lineaDeEjercicio } from '../../../src/entrenamiento/biblioteca';
import { cargarEjercicios } from '../../../src/entrenamiento/fuente';
import { INICIO_DE_AREA, RUTAS_INTERNAS } from '../../../src/navegacion/destinos';
import { tema } from '../../../src/tema';
import type { Exercise } from '@gymlab/contracts';

/**
 * La biblioteca de ejercicios del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI SI SE FILTRA EN EL TELEFONO, AL REVES QUE EN BUSCAR SOCIO.         │
 * │                                                                          │
 * │ No es una incoherencia: son dos endpoints distintos. El de socios busca  │
 * │ en el servidor y traer el gimnasio entero significaria descargar correos │
 * │ y telefonos que nadie ha pedido. Este devuelve la biblioteca COMPLETA de │
 * │ una vez y no admite filtro — son ejercicios, no personas— asi que la     │
 * │ lista ya esta aqui y filtrarla otra vez por red no adelantaria nada.     │
 * │                                                                          │
 * │ Es el mismo filtro que usa el panel web, y lo comprueba un test que      │
 * │ compara las dos implementaciones.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'ok'; ejercicios: Exercise[] }
  | { fase: 'fallo' };

export default function Ejercicios() {
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [busqueda, setBusqueda] = useState('');

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const casa = sesion.tipo === 'autenticado' ? INICIO_DE_AREA[sesion.area] : '/';

  const pedir = useCallback(async () => {
    if (!gymId) return;
    setCarga({ fase: 'cargando' });
    try {
      setCarga({ fase: 'ok', ejercicios: await cargarEjercicios(gymId) });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo' });
    }
  }, [gymId, revisar]);

  /*
   * Se vuelve a pedir al enfocar y no solo al montar: se llega aqui despues de
   * crear, editar o borrar un ejercicio, y la pantalla que hay debajo en la
   * pila conserva la lista de antes. Sin esto, lo que se acaba de crear no
   * aparece hasta cerrar la app.
   */
  useEffect(() => {
    void pedir();
  }, [pedir]);

  const visibles = carga.fase === 'ok' ? filtrarEjercicios(carga.ejercicios, busqueda) : [];
  const buscando = busqueda.trim() !== '';

  return (
    <Pantalla alRefrescar={carga.fase === 'ok' ? () => void pedir() : undefined}>
      <CabeceraDeVuelta titulo="Ejercicios" volverA={casa} etiquetaDeVuelta="Volver" />

      <Boton variante="primario" onPress={() => router.push(RUTAS_INTERNAS.ejercicioNuevo)}>
        Nuevo ejercicio
      </Boton>

      {carga.fase === 'ok' && carga.ejercicios.length > 0 ? (
        <Campo
          etiqueta="Buscar"
          valor={busqueda}
          alCambiar={setBusqueda}
          autoCapitalize="none"
          autoCorrect={false}
          ayuda="Por nombre, material o grupo muscular."
        />
      ) : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar la biblioteca. Inténtalo de nuevo.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <View style={estilos.lista}>
          {visibles.map((ejercicio) => (
            <FilaDeAccion
              key={ejercicio.id}
              titulo={ejercicio.name}
              detalle={lineaDeEjercicio(ejercicio)}
              icono="biblioteca"
              alPulsar={() => router.push(RUTAS_INTERNAS.ejercicio(ejercicio.id))}
              accessibilityHint="Abre el ejercicio para editarlo"
            />
          ))}
          {visibles.length === 0 ? (
            <Text style={estilos.vacio}>
              {buscando
                ? 'Nada con ese texto. Prueba con el nombre, el material o el grupo muscular.'
                : 'La biblioteca está vacía. Crea el primer ejercicio para poder montar rutinas.'}
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
