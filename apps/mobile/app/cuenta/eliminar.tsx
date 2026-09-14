import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { ErasureBlocker } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { CabeceraDeSubpantalla } from '../../src/componentes/cabecera-de-subpantalla';
import { Campo } from '../../src/componentes/campo';
import { Pantalla } from '../../src/componentes/pantalla';
import { useSesion } from '../../src/auth/sesion';
import { borrarCuenta, consultarBorrado } from '../../src/cuenta/fuente';
import { CONFIRMACION, seConfirmo } from '../../src/cuenta/logica';
import { ELIMINAR_CUENTA_WEB } from '../../src/cuenta/enlaces';
import { tema } from '../../src/tema';

type Carga =
  | { fase: 'cargando' }
  | { fase: 'listo'; puedeBorrarse: boolean; bloqueos: ErasureBlocker[] }
  | { fase: 'fallo' };

/**
 * Eliminar mi cuenta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO ES DESACTIVAR. NO HAY VUELTA ATRAS NI PERIODO DE GRACIA.        │
 * │                                                                          │
 * │ Cuando el servidor responde, la cuenta ya no existe y todas las sesiones │
 * │ —en todos los dispositivos— han caido con ella. Una espera de 30 dias    │
 * │ seria comoda de implementar y convertiria el borrado en una baja         │
 * │ reversible, que es justo lo que las dos tiendas NO aceptan como          │
 * │ eliminacion de cuenta.                                                   │
 * │                                                                          │
 * │ Por eso la puerta es escribir una palabra, y no un boton que se pueda    │
 * │ pulsar sin querer.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS BLOQUEOS SE CONSULTAN AL ENTRAR, NO AL PULSAR.                      │
 * │                                                                          │
 * │ Si esta cuenta es la unica dueña de un gimnasio, esa persona tiene que   │
 * │ saberlo ANTES de escribir nada — con el nombre del gimnasio delante y    │
 * │ sabiendo que la salida es invitar a otro dueño. Descubrirlo despues de   │
 * │ confirmar seria decirle que no cuando ya se habia despedido.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function EliminarCuenta() {
  const { salir } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [escrito, setEscrito] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      void (async () => {
        try {
          const r = await consultarBorrado();
          if (vivo) setCarga({ fase: 'listo', ...r });
        } catch {
          if (vivo) setCarga({ fase: 'fallo' });
        }
      })();
      return () => {
        vivo = false;
      };
    }, []),
  );

  const eliminar = async () => {
    setBorrando(true);
    setError(null);
    try {
      const r = await borrarCuenta();
      if (r.ok) {
        /*
         * La sesion del servidor ya no existe. `salir()` limpia la del
         * telefono y devuelve a la puerta: sin esto, la app se quedaria con
         * un token muerto y un 401 en la siguiente pantalla que abriera.
         */
        await salir();
        return;
      }
      setCarga({ fase: 'listo', puedeBorrarse: false, bloqueos: r.bloqueos });
      setEscrito('');
    } catch {
      setError('No hemos podido eliminar tu cuenta. Inténtalo de nuevo.');
    } finally {
      setBorrando(false);
    }
  };

  return (
    <Pantalla titulo="Eliminar mi cuenta" descriptor="Tu identidad en RINDA">
      <CabeceraDeSubpantalla titulo="Eliminar mi cuenta" descriptor="Tu identidad en RINDA" />

      <View style={estilos.bloque}>
        <Text style={estilos.encabezado} accessibilityRole="header">
          Qué ocurre si la eliminas
        </Text>
        <Text style={estilos.parrafo}>
          Se elimina tu identidad en RINDA entera, no sólo en un gimnasio: tu acceso, tus datos
          personales, tus mediciones corporales y los permisos que hayas dado.
        </Text>
        <Text style={estilos.parrafo}>
          Algunos registros se conservan sin tu nombre porque el gimnasio los necesita como hecho:
          los pagos y las entradas quedan como importes y fechas, sin quedar ligados a ti.
        </Text>
        <Text style={estilos.parrafo}>
          No hay periodo de espera ni forma de recuperarla. Se cierran todas tus sesiones, también
          en otros dispositivos.
        </Text>
      </View>

      {carga.fase === 'cargando' ? (
        <Text style={estilos.parrafo}>Comprobando si puedes eliminarla…</Text>
      ) : carga.fase === 'fallo' ? (
        <Aviso tono="peligro">No hemos podido comprobarlo. Vuelve a intentarlo.</Aviso>
      ) : carga.puedeBorrarse ? (
        <View style={estilos.bloque}>
          {error ? <Aviso tono="peligro">{error}</Aviso> : null}
          <Campo
            etiqueta={`Escribe ${CONFIRMACION} para confirmar`}
            ayuda="Es la única forma de continuar."
            valor={escrito}
            alCambiar={setEscrito}
            autoCapitalize="characters"
            autoCorrect={false}
            deshabilitado={borrando}
          />
          <Boton
            variante="peligro"
            onPress={() => void eliminar()}
            cargando={borrando}
            deshabilitado={!seConfirmo(escrito) || borrando}
          >
            Eliminar mi cuenta
          </Boton>
        </View>
      ) : (
        <View style={estilos.bloque}>
          <Aviso tono="aviso">
            {carga.bloqueos.length === 1
              ? `Todavía no: eres la única persona dueña de ${carga.bloqueos[0]!.nombre}.`
              : 'Todavía no: eres la única persona dueña de estos gimnasios.'}
          </Aviso>
          {carga.bloqueos.length > 1 ? (
            <View style={estilos.lista}>
              {carga.bloqueos.map((b) => (
                <Text key={b.gymId} style={estilos.elemento}>
                  · {b.nombre}
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={estilos.parrafo}>
            Un gimnasio no puede quedarse sin quien lo administre: dentro hay socios, cuotas y datos
            de otras personas. Invita a otro dueño desde Personal y vuelve aquí.
          </Text>
        </View>
      )}

      {/*
        El recurso web. Esta aqui y no escondido porque Google lo exige
        accesible sin la app: si alguien la desinstala, este es su camino.
      */}
      <View style={estilos.hueco} />
      <Text style={estilos.pie}>
        También puedes hacerlo desde {ELIMINAR_CUENTA_WEB}
      </Text>
      <Boton onPress={() => void Linking.openURL(ELIMINAR_CUENTA_WEB)}>Abrirlo en el navegador</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.md, marginBottom: tema.espacio.lg },
  encabezado: { ...tema.texto.h3, color: tema.color.texto },
  parrafo: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 22 },
  lista: { gap: tema.espacio.xs },
  elemento: { ...tema.texto.cuerpo, color: tema.color.texto },
  hueco: { flex: 1, minHeight: tema.espacio.lg },
  pie: { ...tema.texto.meta, color: tema.color.textoSecundario, marginBottom: tema.espacio.sm },
});
