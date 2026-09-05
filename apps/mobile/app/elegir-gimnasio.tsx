import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Pantalla } from '../src/componentes/pantalla';
import { Tarjeta } from '../src/componentes/tarjeta';
import { useSesion } from '../src/auth/sesion';
import { mensajeDeEntrada } from '../src/auth/mensajes';
import { tema } from '../src/tema';

/**
 * Elegir gimnasio.
 *
 * Se llega aqui cuando la sesion no tiene gimnasio activo, que es lo que
 * devuelve el servidor cuando hay mas de una membresia (auth.service.ts:200).
 *
 * Solo se ofrecen los gimnasios donde se es SOCIO: elegir uno donde se es
 * entrenador dejaria fuera igualmente, y ofrecerlo seria enviar a un callejon.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CON UN SOLO GIMNASIO, EL BOTON NO LLEVA SU NOMBRE.                      │
 * │                                                                          │
 * │ Antes el unico boton lima decia "Gimnasio de Muestra". Un nombre propio  │
 * │ dentro del color de marca se lee como marca, no como accion: parecia el  │
 * │ logotipo del gimnasio, no algo que pulsar. Y justo debajo, a 12 px,      │
 * │ estaba "Cerrar sesion" con el mismo tamano y el mismo ritmo — dos        │
 * │ acciones opuestas del mismo peso, una al lado de la otra.               │
 * │                                                                          │
 * │ Ahora el gimnasio es CONTENIDO —una ficha que dice cual es— y la accion  │
 * │ es "Continuar". Cerrar sesion se va abajo, separado por el hueco, y en   │
 * │ secundario: sigue estando, pero deja de disputar la mirada.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function ElegirGimnasio() {
  const { estado, elegirGimnasio, salir } = useSesion();
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (estado.tipo !== 'requiereSeleccionGimnasio') return <Redirect href="/" />;

  const opciones = estado.opciones;
  // `unica` en vez de `opciones.length === 1`: asi el compilador sabe que
  // existe, y no hay que afirmarlo con un `!` mas abajo.
  const unica = opciones.length === 1 ? opciones[0] : undefined;

  async function elegir(gymId: string) {
    if (eligiendo) return;
    setEligiendo(gymId);
    setError(null);
    try {
      // switchGym real, y despues `revisar()`: el flujo de siempre.
      await elegirGimnasio(gymId);
    } catch (problema) {
      setError(mensajeDeEntrada(problema));
      setEligiendo(null);
    }
  }

  return (
    <Pantalla>
      <View style={estilos.cabecera}>
        <Text style={estilos.titulo}>{unica ? 'Confirma tu gimnasio' : 'Elige tu gimnasio'}</Text>
        <View style={estilos.carril}>
          <View style={estilos.carrilAcento} />
          <View style={estilos.carrilResto} />
        </View>
        <Text style={estilos.entradilla}>
          {unica
            ? 'Tu sesion todavia no tiene gimnasio activo. Confirma para continuar.'
            : 'Eres socio en varios. Elige con cual quieres entrar.'}
        </Text>
      </View>

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {unica ? (
        <>
          <Tarjeta>
            <Text style={estilos.meta}>GIMNASIO</Text>
            <Text style={estilos.nombreUnico}>{unica.gymName}</Text>
          </Tarjeta>
          <Boton
            variante="primario"
            onPress={() => void elegir(unica.gymId)}
            cargando={eligiendo !== null}
            accessibilityHint="Entra en este gimnasio"
          >
            Continuar
          </Boton>
        </>
      ) : (
        <View style={estilos.lista}>
          {opciones.map((opcion) => (
            <Opcion
              key={opcion.gymId}
              nombre={opcion.gymName}
              alPulsar={() => void elegir(opcion.gymId)}
              cargando={eligiendo === opcion.gymId}
              deshabilitada={eligiendo !== null && eligiendo !== opcion.gymId}
            />
          ))}
        </View>
      )}

      {/* Lo que separa cerrar sesion del resto. Sin esto quedan contiguos. */}
      <View style={estilos.hueco} />

      <Boton onPress={() => void salir()} deshabilitado={eligiendo !== null}>
        Cerrar sesión
      </Boton>
    </Pantalla>
  );
}

/**
 * Un gimnasio de la lista.
 *
 * No es un `Boton`: una opcion que se elige de entre varias no debe tener la
 * forma del boton que confirma. Es una fila de ficha —nombre a la izquierda,
 * punto de acento a la derecha— y al pulsarla el borde se enciende.
 *
 * El punto es el mismo recurso que el de la marca: el acento senala, no
 * decora.
 */
function Opcion({
  nombre,
  alPulsar,
  cargando,
  deshabilitada,
}: {
  nombre: string;
  alPulsar: () => void;
  cargando: boolean;
  deshabilitada: boolean;
}) {
  const inactiva = cargando || deshabilitada;

  return (
    <Pressable
      onPress={alPulsar}
      disabled={inactiva}
      accessibilityRole="button"
      accessibilityLabel={nombre}
      accessibilityHint="Entra en este gimnasio"
      accessibilityState={{ disabled: inactiva, busy: cargando }}
      style={({ pressed }) => [
        estilos.opcion,
        pressed && !inactiva && estilos.opcionPulsada,
        deshabilitada && estilos.opcionApagada,
      ]}
    >
      <Text style={estilos.nombre}>{nombre}</Text>
      {cargando ? <ActivityIndicator color={tema.color.acento} /> : <View style={estilos.punto} />}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  cabecera: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  carril: { flexDirection: 'row', alignItems: 'center', height: 3 },
  carrilAcento: { width: 44, height: 3, borderRadius: 2, backgroundColor: tema.color.acento },
  carrilResto: { flex: 1, height: 1, backgroundColor: tema.color.borde },
  entradilla: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 22 },

  meta: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    color: tema.color.textoSecundario,
  },
  nombreUnico: { ...tema.texto.h2, color: tema.color.texto },

  lista: { gap: tema.espacio.md },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tema.espacio.md,
    minHeight: 56,
    paddingHorizontal: tema.espacio.lg,
    paddingVertical: tema.espacio.md,
    backgroundColor: tema.color.superficie,
    borderColor: tema.color.borde,
    borderWidth: 1,
    borderRadius: tema.radio.tarjeta,
  },
  opcionPulsada: { backgroundColor: tema.color.superficieAlta, borderColor: tema.color.acento },
  opcionApagada: { opacity: 0.45 },
  nombre: { ...tema.texto.cuerpo, fontWeight: '600', color: tema.color.texto, flexShrink: 1 },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: tema.color.acento },

  hueco: { flex: 1, minHeight: tema.espacio.xl },
});
