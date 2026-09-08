import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Routine } from '@gymlab/contracts';
import { Aviso } from '../../../../src/componentes/aviso';
import { Boton } from '../../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../../src/componentes/cabecera-de-vuelta';
import { EjercicioDeRutina } from '../../../../src/componentes/ejercicio-de-rutina';
import { Etiqueta } from '../../../../src/componentes/etiqueta';
import { Pantalla } from '../../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../../src/auth/politica';
import { useSesion } from '../../../../src/auth/sesion';
import { lineaDeRutina } from '../../../../src/entrenamiento/biblioteca';
import { archivarRutina, cargarRutina } from '../../../../src/entrenamiento/fuente';
import { tieneSentidoArchivar } from '../../../../src/entrenamiento/permisos';
import { RUTAS_INTERNAS } from '../../../../src/navegacion/destinos';
import { tema } from '../../../../src/tema';

/**
 * La ficha de una rutina: que tiene dentro, y que se puede hacer con ella.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ARCHIVAR SE OFRECE SIEMPRE, Y DECIDE EL SERVIDOR.                       │
 * │                                                                          │
 * │ El servidor se lo permite al dueño siempre y al entrenador SOLO si creo  │
 * │ la rutina. Pero `routineSchema` no dice quien la creo: aqui no se puede  │
 * │ saber. Esconder el boton a los entrenadores les quitaria el archivado de │
 * │ SUS PROPIAS rutinas, que es justo lo que si pueden hacer.                │
 * │                                                                          │
 * │ Asi que se ofrece y, si el servidor dice que no, se enseña su motivo —   │
 * │ que explica el porque mucho mejor de lo que podria adivinarlo el movil.  │
 * │ Es exactamente lo que hace el panel web.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
type Carga = { fase: 'cargando' } | { fase: 'ok'; rutina: Routine } | { fase: 'fallo' };

export default function FichaDeRutina() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [confirmando, setConfirmando] = useState(false);
  const [archivando, setArchivando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    setCarga({ fase: 'cargando' });
    try {
      setCarga({ fase: 'ok', rutina: await cargarRutina(gymId, id) });
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

  async function archivar() {
    if (!gymId || !id) return;
    setArchivando(true);
    setError(null);
    try {
      setCarga({ fase: 'ok', rutina: await archivarRutina(gymId, id) });
      setConfirmando(false);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      // El mensaje del servidor explica quien puede archivarla y por que. No
      // se sustituye por uno generico: aqui dice mas que nosotros.
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos archivarla. Inténtalo de nuevo.',
      );
      setConfirmando(false);
    } finally {
      setArchivando(false);
    }
  }

  const rutina = carga.fase === 'ok' ? carga.rutina : null;

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo={rutina?.name ?? 'Rutina'}
        descriptor={rutina ? lineaDeRutina(rutina) : undefined}
        volverA={RUTAS_INTERNAS.rutinas}
        etiquetaDeVuelta="Rutinas"
      />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar la rutina.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {rutina ? (
        <>
          {rutina.status !== 'active' ? (
            <Etiqueta tono="neutro">Archivada</Etiqueta>
          ) : null}

          {rutina.description ? (
            <Text style={estilos.descripcion}>{rutina.description}</Text>
          ) : null}

          <View style={estilos.ejercicios}>
            {rutina.items.map((item, indice) => (
              <EjercicioDeRutina key={item.id} item={item} indice={indice} primero={indice === 0} />
            ))}
          </View>

          <Boton onPress={() => router.push(RUTAS_INTERNAS.editarRutina(rutina.id))}>
            Editar rutina
          </Boton>

          {tieneSentidoArchivar(rutina.status) ? (
            confirmando ? (
              <View style={estilos.confirmar}>
                <Text style={estilos.pregunta}>
                  ¿Archivarla? Dejará de poder asignarse. Lo que ya está asignado se conserva, y
                  en esta versión no se puede desarchivar.
                </Text>
                <Boton
                  variante="peligro"
                  onPress={() => void archivar()}
                  cargando={archivando}
                  deshabilitado={archivando}
                >
                  Sí, archivarla
                </Boton>
                <Boton onPress={() => setConfirmando(false)} deshabilitado={archivando}>
                  Dejarla como está
                </Boton>
              </View>
            ) : (
              <Boton onPress={() => setConfirmando(true)}>Archivar</Boton>
            )
          ) : null}
        </>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  descripcion: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 22 },
  ejercicios: { gap: tema.espacio.sm },
  confirmar: { gap: tema.espacio.md },
  pregunta: { ...tema.texto.secundario, color: tema.color.texto, lineHeight: 22 },
});
