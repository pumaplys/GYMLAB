import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TextInput } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Campo } from '../src/componentes/campo';
import { Marca } from '../src/componentes/marca';
import { useSesion } from '../src/auth/sesion';
import { mensajeDeEntrada } from '../src/auth/mensajes';
import { API_URL } from '../src/api/config';
import { CarrilDeAcento } from '../src/componentes/carril';
import { tema } from '../src/tema';

/**
 * Entrar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES UN FORMULARIO CENTRADO EN MEDIO DE LA NADA.                       │
 * │                                                                          │
 * │ La pantalla se lee de arriba abajo: marca, una frase que dice de que va  │
 * │ esto, y despues el trabajo. Los campos viven dentro de una superficie    │
 * │ que los agrupa, y el unico boton lima de la pantalla es "Entrar".       │
 * │                                                                          │
 * │ El adorno es UNO: una linea de acento bajo el titulo. Ni degradados, ni  │
 * │ resplandores, ni cristal esmerilado — en una pantalla oscura eso se      │
 * │ convierte en ruido y en bateria, y no ayuda a escribir un correo.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Solo entrar. No hay registro libre, ni Google, ni Apple, ni biometria:
 * ninguna de las cuatro existe en el producto, y ofrecer un boton que no
 * lleva a ningun sitio es peor que no tenerlo.
 */
export default function Entrar() {
  const { estado, entrar } = useSesion();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campoClave = useRef<TextInput>(null);

  // Si ya hay sesion —por ejemplo al volver del selector— esta pantalla no
  // pinta nada: manda la puerta.
  if (estado.tipo === 'autenticado') return <Redirect href="/inicio" />;

  const listo = correo.trim().length > 0 && clave.length > 0 && !enviando;

  async function enviar() {
    // Doble barrera contra el doble envio: el boton se deshabilita Y la
    // funcion se corta. Un toque doble rapido llega antes de que React
    // repinte, y sin esto se lanzarian dos peticiones de login.
    if (enviando || !listo) return;

    setEnviando(true);
    setError(null);
    try {
      await entrar({ email: correo.trim(), password: clave });
      // No se navega a mano: al cambiar el estado de sesion, la puerta
      // redirige sola. Asi solo hay UN sitio que decide rutas.
    } catch (problema) {
      setError(mensajeDeEntrada(problema));
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.raiz} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={tema.color.fondo} />
      {/*
        `padding` en iOS y `height` en Android: son los dos comportamientos que
        funcionan en cada plataforma. Sin esto el teclado tapa el boton de
        entrar, que es justo lo que hay que pulsar.
      */}
      <KeyboardAvoidingView
        style={estilos.flexible}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Con el teclado abierto en una pantalla pequena, esto es lo que
          // permite llegar al boton desplazando en lugar de quedarse fuera.
          showsVerticalScrollIndicator={false}
        >
          <View style={estilos.cabecera}>
            <Marca />
            <Text style={estilos.descriptor}>Tu gimnasio, conectado.</Text>
          </View>

          <View style={estilos.principal}>
            <View style={estilos.tituloBloque}>
              <Text style={estilos.titulo}>Hola de nuevo</Text>
              {/*
                El unico gesto grafico de la pantalla. Antes era un filete
                suelto de 44 px; ahora el acento arranca y una linea fina lo
                continua hasta el borde. Es un carril, y cuesta 4 px de alto.
              */}
              <CarrilDeAcento />
              <Text style={estilos.entradilla}>
                Entra con la cuenta que te dio tu gimnasio.
              </Text>
            </View>

            <View style={estilos.formulario}>
              <Campo
                etiqueta="Correo"
                valor={correo}
                alCambiar={setCorreo}
                deshabilitado={enviando}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => campoClave.current?.focus()}
              />

              <Campo
                etiqueta="Contraseña"
                valor={clave}
                alCambiar={setClave}
                deshabilitado={enviando}
                secreto
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void enviar()}
              />

              {error ? <Aviso tono="peligro">{error}</Aviso> : null}

              <Boton
                variante="primario"
                onPress={() => void enviar()}
                deshabilitado={!listo}
                cargando={enviando}
                accessibilityHint="Entra en tu cuenta de socio"
              >
                Entrar
              </Boton>

              {/*
                Enlaza al flujo de recuperacion que YA existe en el panel web:
                `/forgot-password`. No se reimplementa en la app porque no hay
                pantalla movil para restablecer —el enlace del correo lleva a
                la web— y montar media mitad del flujo aqui seria dejar a
                alguien a medio camino.
              */}
              <Pressable
                onPress={() => void abrirRecuperacion()}
                style={estilos.enlace}
                accessibilityRole="link"
                accessibilityLabel="He olvidado mi contraseña"
                accessibilityHint="Abre la recuperación de contraseña en el navegador"
              >
                <Text style={estilos.textoEnlace}>He olvidado mi contraseña</Text>
              </Pressable>
            </View>
          </View>

          {/*
            El sobrante de una pantalla alta se acumula AQUI, entre el
            formulario y el pie. Antes lo repartia `justifyContent: center`
            alrededor del bloque, y por eso un telefono mas grande hacia el
            login mas vacio por arriba: 116 px de hueco a 360 y 182 a 430.
          */}
          <View style={estilos.hueco} />

          <View style={estilos.pie}>
            <Text style={estilos.pieTexto}>Solo para socios. El personal usa el panel web.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Abre la recuperacion de contrasena en el navegador del telefono.
 *
 * La URL se deriva de la de la API quitando el `/v1`: el panel y la API se
 * sirven bajo el mismo origen en produccion, que es el supuesto sobre el que
 * se apoya todo el modelo de sesion. En desarrollo apuntan al mismo host.
 */
async function abrirRecuperacion() {
  const { openBrowserAsync } = await import('expo-linking').then((m) => ({
    openBrowserAsync: m.openURL,
  }));
  const base = API_URL.replace(/\/v1\/?$/, '');
  await openBrowserAsync(`${base}/forgot-password`).catch(() => undefined);
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: tema.color.fondo },
  flexible: { flex: 1 },
  // Sin `gap`: el ritmo se escribe bloque a bloque para que sea deliberado y
  // no dependa de cuantos hijos haya.
  contenido: { flexGrow: 1, padding: tema.espacio.xl },
  cabecera: { gap: tema.espacio.sm },
  descriptor: { ...tema.texto.secundario, color: tema.color.textoSecundario },

  // Distancia FIJA de la marca al trabajo. Es la cifra que antes crecia con
  // el telefono; ahora vale 48 en los tres y el sobrante se va abajo.
  principal: { marginTop: tema.espacio.xxxl, gap: tema.espacio.xl },

  // Se encoge hasta cero cuando no sobra sitio: en una pantalla baja el
  // contenido manda y aparece el scroll, en lugar de robarle espacio.
  hueco: { flex: 1, minHeight: tema.espacio.xxl },

  tituloBloque: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  entradilla: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 22 },

  formulario: {
    gap: tema.espacio.lg,
    backgroundColor: tema.color.superficie,
    borderColor: tema.color.borde,
    borderWidth: 1,
    borderRadius: tema.radio.tarjeta,
    padding: tema.espacio.xl,
  },

  enlace: {
    minHeight: tema.controlAltoMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoEnlace: { ...tema.texto.secundario, fontWeight: '600', color: tema.color.textoSecundario },

  pie: { alignItems: 'center', marginTop: tema.espacio.xl },
  pieTexto: { ...tema.texto.meta, color: tema.color.textoSecundario, textAlign: 'center' },
});
