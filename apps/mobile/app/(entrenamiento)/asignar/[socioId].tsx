import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { AssignedRoutine, Routine } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { Boton } from '../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { FilaDeAccion } from '../../../src/componentes/fila-de-accion';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { asignables, lineaDeRutina } from '../../../src/entrenamiento/biblioteca';
import {
  asignarRutina,
  cargarRutinas,
  cargarRutinasDeSocio,
} from '../../../src/entrenamiento/fuente';
import { RUTAS_INTERNAS } from '../../../src/navegacion/destinos';
import { tema } from '../../../src/tema';

/**
 * Elegir que rutina se le pone a un socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PIDEN LAS DOS LISTAS: LAS DEL GIMNASIO Y LAS QUE YA SIGUE.           │
 * │                                                                          │
 * │ Asignar NO reemplaza: un socio puede seguir varias a la vez —fuerza y    │
 * │ movilidad— y esa es una decision del modelo. Pero la MISMA rutina dos    │
 * │ veces la rechaza el servidor con un 400, y una archivada tambien.        │
 * │                                                                          │
 * │ Ofrecer lo que va a dar error no es informar: es hacer que la app        │
 * │ parezca rota. Por eso se filtran las dos aqui, con la lista que el       │
 * │ propio servidor devuelve — no con una regla adivinada.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * De quien es el socio lo comprueba el servidor: al entrenador le exige que
 * sea suyo. Aqui no se replica, porque en el movil solo se llega desde la
 * ficha de un socio al que ya se tiene acceso.
 */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'ok'; rutinas: Routine[]; yaSigue: AssignedRoutine[] }
  | { fase: 'fallo' };

export default function Asignar() {
  const { socioId } = useLocalSearchParams<{ socioId: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [asignando, setAsignando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const volverA =
    sesion.tipo === 'autenticado' && sesion.rol === 'trainer'
      ? RUTAS_INTERNAS.socioDelEntrenador(socioId ?? '')
      : RUTAS_INTERNAS.socioDelPanel(socioId ?? '');

  const pedir = useCallback(async () => {
    if (!gymId || !socioId) return;
    setCarga({ fase: 'cargando' });
    try {
      const [rutinas, yaSigue] = await Promise.all([
        cargarRutinas(gymId),
        cargarRutinasDeSocio(gymId, socioId),
      ]);
      setCarga({ fase: 'ok', rutinas, yaSigue });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo' });
    }
  }, [gymId, socioId, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function asignar(rutinaId: string) {
    if (!gymId || !socioId || asignando) return;
    setAsignando(rutinaId);
    setError(null);
    try {
      await asignarRutina(gymId, rutinaId, socioId);
      router.replace(volverA);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos asignarla. Inténtalo de nuevo.',
      );
      setAsignando(null);
    }
  }

  const disponibles = carga.fase === 'ok' ? asignables(carga.rutinas, carga.yaSigue) : [];

  return (
    <Pantalla>
      <CabeceraDeVuelta titulo="Asignar rutina" volverA={volverA} etiquetaDeVuelta="Socio" />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar las rutinas.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <View style={estilos.lista}>
          {disponibles.map((rutina) => (
            <FilaDeAccion
              key={rutina.id}
              titulo={rutina.name}
              detalle={lineaDeRutina(rutina)}
              icono="rutina"
              alPulsar={() => void asignar(rutina.id)}
              accessibilityHint="Le asigna esta rutina a este socio"
            />
          ))}

          {disponibles.length === 0 ? (
            <Text style={estilos.vacio}>
              {carga.rutinas.length === 0
                ? 'Todavía no hay rutinas en el gimnasio. Crea una primero.'
                : 'No queda ninguna rutina que asignarle: ya sigue todas las activas.'}
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
