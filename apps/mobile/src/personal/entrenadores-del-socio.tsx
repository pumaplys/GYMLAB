import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { MemberTrainer } from '@gymlab/contracts';
import { Aviso } from '../componentes/aviso';
import { Boton } from '../componentes/boton';
import { laSesionYaNoVale } from '../auth/politica';
import { fechaCivil } from '../formato/fecha';
import { lineaDeEntrenadorDelSocio } from './logica';
import { retirarEntrenador } from './fuente';
import { RUTAS_INTERNAS } from '../navegacion/destinos';
import { tema } from '../tema';

/**
 * Los entrenadores que lleva un socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO ES GESTIONAR ENTRENADORES, NO USAR RINDA SIENDO ENTRENADOR.        │
 * │                                                                          │
 * │ Quien reparte los socios es el mostrador —dueño y recepcion—, y por eso  │
 * │ esta tarjeta vive en la ficha del Panel. El area del entrenador es otra  │
 * │ cosa: `/me/trainer`, donde ve a los suyos y no elige a quien entrena.    │
 * │                                                                          │
 * │ Son dos ideas que se parecen y no son la misma, y mezclarlas seria darle │
 * │ al entrenador un permiso que la API no le da.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Retirar NO borra la asignacion: le pone fecha de fin. Es lo que permite
 * volver a asignar la misma pareja mas adelante, y lo que hace que las rutinas
 * que asigno ese entrenador sigan teniendo explicacion.
 */
export function EntrenadoresDelSocio({
  gymId,
  socioId,
  entrenadores,
  alCambiar,
  alCaducarSesion,
}: {
  gymId: string | null;
  socioId: string;
  /** `null` es «no se pudieron cargar», distinto de «no lleva ninguno». */
  entrenadores: readonly MemberTrainer[] | null;
  alCambiar: () => void;
  alCaducarSesion: () => void;
}) {
  const [retirando, setRetirando] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retirar(trainerId: string) {
    if (!gymId || enCurso) return;
    setEnCurso(true);
    setError(null);
    try {
      await retirarEntrenador(gymId, trainerId, socioId);
      setRetirando(null);
      alCambiar();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        alCaducarSesion();
        return;
      }
      setError('No pudimos retirar la asignación. Inténtalo de nuevo.');
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <View style={estilos.bloque}>
      <Text style={estilos.rotulo}>Entrenadores</Text>

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {entrenadores === null ? (
        <Text style={estilos.texto}>No hemos podido cargar sus entrenadores.</Text>
      ) : entrenadores.length === 0 ? (
        <Text style={estilos.texto}>Todavía no tiene ningún entrenador asignado.</Text>
      ) : (
        entrenadores.map((asignado) => {
          const linea = lineaDeEntrenadorDelSocio(asignado, fechaCivil);
          const confirmando = retirando === asignado.trainerId;
          return (
            <View key={asignado.assignmentId} style={estilos.fila}>
              <Text style={estilos.titulo}>{linea.titulo}</Text>
              <Text style={estilos.detalle}>{linea.detalle}</Text>

              {confirmando ? (
                <View style={estilos.confirmar}>
                  <Text style={estilos.detalle}>
                    ¿Retirar la asignación? Dejará de ser su entrenador desde hoy. Queda registrado
                    que lo fue, y las rutinas que le asignó se conservan.
                  </Text>
                  <Boton
                    variante="peligro"
                    onPress={() => void retirar(asignado.trainerId)}
                    cargando={enCurso}
                    deshabilitado={enCurso}
                  >
                    Sí, retirar
                  </Boton>
                  <Boton onPress={() => setRetirando(null)} deshabilitado={enCurso}>
                    Que siga
                  </Boton>
                </View>
              ) : (
                <Pressable
                  onPress={() => setRetirando(asignado.trainerId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirar a ${linea.titulo}`}
                  style={({ pressed }) => [estilos.accion, pressed && estilos.pulsado]}
                >
                  <Text style={estilos.textoPeligro}>Retirar</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}

      <Boton onPress={() => router.push(RUTAS_INTERNAS.entrenadoresDe(socioId))}>
        Asignar un entrenador
      </Boton>
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
  accion: {
    alignSelf: 'flex-start',
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
  },
  textoPeligro: { ...tema.texto.secundario, color: tema.tinte.borde('peligro') },
  pulsado: { opacity: 0.6 },
});
