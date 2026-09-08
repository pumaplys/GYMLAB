import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { AssignedMember } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { FilaDeAccion } from '../../src/componentes/fila-de-accion';
import { Pantalla } from '../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { cargarMisSocios } from '../../src/entrenador/fuente';
import {
  lineaDeAsignado,
  ordenados,
  recuentoDeSocios,
  type EstadoDeCarga,
} from '../../src/entrenador/logica';
import { RUTAS_INTERNAS } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * Mis socios.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO LOS SUYOS, Y NO PORQUE AQUI SE FILTRE.                             │
 * │                                                                          │
 * │ `/me/trainer/members` sale de la SESION: no hay ningun identificador que │
 * │ manipular para pedir la lista de otro entrenador. La app no elige a      │
 * │ quien enseña; el servidor decide que hay que enseñar.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sustituye al marcador de STAFF-1. Lo que dice ahora es lo que hay, no una
 * promesa: la lista de verdad, y el vacio dicho como vacio.
 */
export default function MisSocios() {
  const { estado: sesion, revisar, salir } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga<readonly AssignedMember[]>>({
    fase: 'cargando',
  });
  const [refrescando, setRefrescando] = useState(false);

  const gimnasio =
    sesion.tipo === 'autenticado'
      ? sesion.yo.memberships.find((m) => m.gymId === sesion.gymId)?.gymName
      : undefined;

  const pedir = useCallback(async () => {
    try {
      setCarga({ fase: 'ok', datos: ordenados(await cargarMisSocios()) });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo', mensaje: 'No hemos podido cargar tus socios.' });
    }
  }, [revisar]);

  useFocusEffect(
    useCallback(() => {
      void pedir();
    }, [pedir]),
  );

  const refrescar = useCallback(() => {
    setRefrescando(true);
    void pedir().finally(() => setRefrescando(false));
  }, [pedir]);

  return (
    <Pantalla
      titulo="Mis socios"
      descriptor={gimnasio}
      alRefrescar={carga.fase === 'ok' ? refrescar : undefined}
      refrescando={refrescando}
    >
      {carga.fase === 'cargando' ? (
        <View style={estilos.espera}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? <Aviso tono="peligro">{carga.mensaje}</Aviso> : null}

      {carga.fase === 'ok' && carga.datos.length === 0 ? (
        <Aviso>
          Todavía no tienes ningún socio asignado. Quien lleva el gimnasio los asigna desde el
          panel.
        </Aviso>
      ) : null}

      {/*
        ┌──────────────────────────────────────────────────────────────────┐
        │ ENTRENAMIENTO VA ARRIBA, ANTES DE LA LISTA.                      │
        │                                                                  │
        │ Es lo que un entrenador hace SIN tener a nadie delante: preparar  │
        │ rutinas y mantener la biblioteca. La lista de socios es para      │
        │ cuando si hay alguien delante, y entonces se busca por su nombre. │
        │                                                                  │
        │ Estas dos filas no llevan condicional de rol: quien esta en esta  │
        │ pantalla es entrenador, y el gate del grupo `(entrenamiento)` lo  │
        │ vuelve a comprobar al entrar.                                     │
        └──────────────────────────────────────────────────────────────────┘
      */}
      <View style={estilos.lista}>
        <FilaDeAccion
          titulo="Rutinas"
          detalle="Crea y edita las rutinas del gimnasio."
          icono="rutina"
          alPulsar={() => router.push(RUTAS_INTERNAS.rutinas)}
        />
        <FilaDeAccion
          titulo="Ejercicios"
          detalle="La biblioteca con la que se montan las rutinas."
          icono="biblioteca"
          alPulsar={() => router.push(RUTAS_INTERNAS.ejercicios)}
        />
      </View>

      {carga.fase === 'ok' && carga.datos.length > 0 ? (
        <View style={estilos.lista}>
          <Text style={estilos.recuento}>{recuentoDeSocios(carga.datos.length)}</Text>
          {carga.datos.map((socio) => {
            const linea = lineaDeAsignado(socio);
            return (
              <FilaDeAccion
                key={socio.id}
                titulo={linea.titulo}
                detalle={linea.detalle}
                icono="socios"
                alPulsar={() => router.push(RUTAS_INTERNAS.socioDelEntrenador(socio.id))}
              />
            );
          })}
        </View>
      ) : null}

      <Boton onPress={() => void salir()}>Cerrar sesión</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  lista: { gap: tema.espacio.sm },
  espera: { paddingVertical: tema.espacio.xxxl, alignItems: 'center' },
  recuento: { ...tema.texto.meta, color: tema.color.textoSecundario, letterSpacing: 1 },
});
