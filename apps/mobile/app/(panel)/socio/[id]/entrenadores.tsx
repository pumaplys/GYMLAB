import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { MemberTrainer, Trainer } from '@gymlab/contracts';
import { Aviso } from '../../../../src/componentes/aviso';
import { Boton } from '../../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../../src/componentes/cabecera-de-vuelta';
import { FilaDeAccion } from '../../../../src/componentes/fila-de-accion';
import { Pantalla } from '../../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../../src/auth/politica';
import { useSesion } from '../../../../src/auth/sesion';
import { entrenadoresAsignables } from '../../../../src/personal/logica';
import {
  asignarEntrenador,
  cargarEntrenadores,
  cargarEntrenadoresDeSocio,
} from '../../../../src/personal/fuente';
import { RUTAS_INTERNAS } from '../../../../src/navegacion/destinos';
import { tema } from '../../../../src/tema';

/**
 * Elegir que entrenador se le pone a un socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PIDEN LAS DOS LISTAS: LOS DEL GIMNASIO Y LOS QUE YA LLEVA.           │
 * │                                                                          │
 * │ Un socio puede llevar varios entrenadores a la vez, pero el MISMO dos    │
 * │ veces lo rechaza el servidor, y uno de baja tampoco se puede asignar.    │
 * │ Se filtran los dos casos aqui para no ofrecer lo que va a dar error.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'ok'; entrenadores: Trainer[]; yaLleva: MemberTrainer[] }
  | { fase: 'fallo' };

export default function AsignarEntrenador() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [asignando, setAsignando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const volverA = id ? RUTAS_INTERNAS.socioDelPanel(id) : '/buscar';

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    setCarga({ fase: 'cargando' });
    try {
      const [entrenadores, yaLleva] = await Promise.all([
        cargarEntrenadores(gymId),
        cargarEntrenadoresDeSocio(gymId, id),
      ]);
      setCarga({ fase: 'ok', entrenadores, yaLleva });
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

  async function asignar(entrenadorId: string) {
    if (!gymId || !id || asignando) return;
    setAsignando(entrenadorId);
    setError(null);
    try {
      await asignarEntrenador(gymId, entrenadorId, id);
      router.replace(volverA);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos asignarlo. Inténtalo de nuevo.',
      );
      setAsignando(null);
    }
  }

  const disponibles =
    carga.fase === 'ok' ? entrenadoresAsignables(carga.entrenadores, carga.yaLleva) : [];

  return (
    <Pantalla>
      <CabeceraDeVuelta titulo="Asignar entrenador" volverA={volverA} etiquetaDeVuelta="Ficha" />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar los entrenadores.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <View style={estilos.lista}>
          {disponibles.map((entrenador) => (
            <FilaDeAccion
              key={entrenador.id}
              titulo={entrenador.name}
              detalle={
                entrenador.activeMembers === 1
                  ? '1 socio ahora mismo'
                  : `${entrenador.activeMembers} socios ahora mismo`
              }
              icono="socios"
              alPulsar={() => void asignar(entrenador.id)}
              accessibilityHint="Le asigna este entrenador a este socio"
            />
          ))}

          {disponibles.length === 0 ? (
            <Text style={estilos.vacio}>
              {carga.entrenadores.length === 0
                ? 'Todavía no hay entrenadores en el gimnasio. Invita a uno desde Personal.'
                : 'No queda ningún entrenador que asignarle: ya lleva todos los que están activos.'}
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
