import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Campo } from '../src/componentes/campo';
import { PantallaDeAcceso } from '../src/componentes/pantalla-de-acceso';
import { pedirEnlace } from '../src/auth/acceso';
import { mensajeDeRecuperacion } from '../src/auth/recuperacion';
import { tema } from '../src/tema';

/**
 * Pedir el correo con el enlace para poner una contraseña nueva.
 *
 * Es la única vía de vuelta al sistema para quien olvida su contraseña: nadie
 * puede reponérsela, ni el dueño del gimnasio.
 */
export default function Recuperar() {
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** El correo que se escribió, o null si aún no se ha enviado nada. */
  const [enviadoA, setEnviadoA] = useState<string | null>(null);

  const listo = correo.trim().length > 0 && !enviando;

  async function enviar() {
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      const limpio = correo.trim();
      await pedirEnlace({ email: limpio });
      setEnviadoA(limpio);
    } catch (problema) {
      setError(mensajeDeRecuperacion(problema));
    } finally {
      setEnviando(false);
    }
  }

  if (enviadoA !== null) return <Confirmacion correo={enviadoA} />;

  return (
    <PantallaDeAcceso
      titulo="Recuperar el acceso"
      entradilla="Escribe tu correo y te llega un enlace para poner una contraseña nueva."
    >
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      <Campo
        etiqueta="Correo electrónico"
        valor={correo}
        alCambiar={setCorreo}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={() => void enviar()}
        deshabilitado={enviando}
      />

      <Boton variante="primario" onPress={() => void enviar()} deshabilitado={!listo} cargando={enviando}>
        Enviarme el enlace
      </Boton>

      <Volver />
    </PantallaDeAcceso>
  );
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE PUEDE DECIR «TE HEMOS ENVIADO UN CORREO». PUEDE QUE NO.      │
 * │                                                                          │
 * │ El servidor responde `ok` exista la cuenta o no, y es deliberado: si     │
 * │ respondiera distinto, esta pantalla seria un comprobador de quien esta   │
 * │ dado de alta —se prueban correos uno a uno y el que conteste diferente   │
 * │ delata a un cliente—. Como la respuesta no lo sabe, la pantalla tampoco  │
 * │ puede afirmarlo.                                                         │
 * │                                                                          │
 * │ De ahi el «si … tiene cuenta». Es literalmente todo lo que consta.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function Confirmacion({ correo }: { correo: string }) {
  return (
    <PantallaDeAcceso titulo="Revisa tu correo">
      <Text style={estilos.parrafo}>
        Si <Text style={estilos.correo}>{correo}</Text> tiene cuenta en RINDA, ahí está el enlace
        para poner una contraseña nueva. Caduca, así que mejor abrirlo ahora.
      </Text>
      <Text style={estilos.parrafo}>
        Si no llega, mira en la carpeta de correo no deseado y comprueba que la dirección está
        bien escrita.
      </Text>
      <Volver />
    </PantallaDeAcceso>
  );
}

function Volver() {
  return (
    <Pressable
      onPress={() => router.replace('/entrar')}
      accessibilityRole="button"
      style={({ pressed }) => [estilos.volver, pressed && estilos.pulsado]}
    >
      <Text style={estilos.textoVolver}>Volver a entrar</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  parrafo: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 24 },
  correo: { color: tema.color.texto, fontWeight: '600' },
  volver: {
    alignSelf: 'center',
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
    paddingHorizontal: tema.espacio.lg,
  },
  pulsado: { opacity: 0.6 },
  textoVolver: { ...tema.texto.cuerpo, color: tema.color.acento },
});
