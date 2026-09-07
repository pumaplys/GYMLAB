import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Campo } from '../src/componentes/campo';
import { PantallaDeAcceso } from '../src/componentes/pantalla-de-acceso';
import { restablecerClave } from '../src/auth/acceso';
import { useSesion } from '../src/auth/sesion';
import { mensajeDeRestablecer, tokenDelEnlace } from '../src/auth/recuperacion';
import { tema } from '../src/tema';

/** El mínimo que exige el contrato. Se dice antes de escribir, no después. */
const LARGO_MINIMO = 10;

/**
 * Elegir una contraseña nueva con el token del correo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ENLACE DEL CORREO APUNTA HOY AL PANEL WEB, NO A LA APP.              │
 * │                                                                          │
 * │ El servidor construye `${WEB_APP_URL}/reset-password?token=…`, asi que   │
 * │ tocarlo en el telefono abre Safari. Que esta pantalla exista NO es       │
 * │ inutil: la app queda lista para recibirlo por `rinda://restablecer` en   │
 * │ cuanto se configuren enlaces universales, que es trabajo de dominio y    │
 * │ de Apple, no de esta rama. Queda reportado como decision pendiente.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Restablecer() {
  const parametros = useLocalSearchParams<{ token?: string }>();
  const token = tokenDelEnlace(parametros.token);
  const { revisar } = useSesion();

  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);

  if (token === null) return <SinEnlace />;
  if (hecho) return <Listo />;

  const listo = clave.length >= LARGO_MINIMO && !enviando;

  async function enviar() {
    if (!listo || token === null) return;
    setEnviando(true);
    setError(null);
    try {
      await restablecerClave({ token, newPassword: clave });
      /*
       * ┌──────────────────────────────────────────────────────────────────┐
       * │ CAMBIAR LA CONTRASEÑA CIERRA TODAS LAS SESIONES, INCLUIDA ESTA.  │
       * │                                                                  │
       * │ Si alguien restablece desde el mismo telefono en el que ya estaba │
       * │ dentro, su sesion muere en este instante — pero la app sigue      │
       * │ creyendo que la tiene. Sin este `revisar()`, la siguiente         │
       * │ pantalla pediria datos con un token muerto y rebotaria con un     │
       * │ 401 que nadie esperaba.                                           │
       * │                                                                  │
       * │ Esta pantalla SABE que la sesion acaba de morir. Enterarse por un │
       * │ rechazo, pudiendo decirlo, es dejar que lo descubra el usuario.   │
       * └──────────────────────────────────────────────────────────────────┘
       */
      await revisar();
      setHecho(true);
    } catch (problema) {
      setError(mensajeDeRestablecer(problema));
      setEnviando(false);
    }
  }

  return (
    <PantallaDeAcceso
      titulo="Elige una contraseña nueva"
      entradilla="Al guardarla, el enlace del correo deja de servir."
    >
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      <Campo
        etiqueta="Contraseña nueva"
        ayuda={`Al menos ${LARGO_MINIMO} caracteres. Larga es mejor que complicada.`}
        valor={clave}
        alCambiar={setClave}
        secreto
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void enviar()}
        deshabilitado={enviando}
      />

      <Boton
        variante="primario"
        onPress={() => void enviar()}
        deshabilitado={!listo}
        cargando={enviando}
      >
        Guardar la contraseña
      </Boton>

      <Enlace texto="Pedir un enlace nuevo" a="/recuperar" />
    </PantallaDeAcceso>
  );
}

/*
 * Un token en blanco y uno ausente se tratan igual, y el texto no acusa a
 * nadie: lo mas probable es que el enlace se partiera al copiarlo.
 */
function SinEnlace() {
  return (
    <PantallaDeAcceso
      titulo="Falta el enlace"
      entradilla="Abre el enlace tal y como te llegó en el correo, sin recortarlo. Si lo has copiado a mano, puede que se haya perdido un trozo."
    >
      <Enlace texto="Pedir un enlace nuevo" a="/recuperar" />
    </PantallaDeAcceso>
  );
}

function Listo() {
  return (
    <PantallaDeAcceso
      titulo="Contraseña cambiada"
      entradilla="Ya puedes entrar con la contraseña nueva. Si tenías la sesión abierta en otro sitio, se ha cerrado."
    >
      <Boton variante="primario" onPress={() => router.replace('/entrar')}>
        Entrar
      </Boton>
    </PantallaDeAcceso>
  );
}

function Enlace({ texto, a }: { texto: string; a: '/recuperar' | '/entrar' }) {
  return (
    <Pressable
      onPress={() => router.replace(a)}
      accessibilityRole="button"
      style={({ pressed }) => [estilos.enlace, pressed && estilos.pulsado]}
    >
      <Text style={estilos.textoEnlace}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  enlace: {
    alignSelf: 'center',
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
    paddingHorizontal: tema.espacio.lg,
  },
  pulsado: { opacity: 0.6 },
  textoEnlace: { ...tema.texto.cuerpo, color: tema.color.acento },
});
