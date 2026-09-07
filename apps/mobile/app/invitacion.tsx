import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Campo } from '../src/componentes/campo';
import { PantallaDeAcceso } from '../src/componentes/pantalla-de-acceso';
import { aceptarInvitacion, vincularInvitacion } from '../src/auth/acceso';
import { useSesion } from '../src/auth/sesion';
import type { EstadoDeSesion } from '../src/auth/estado';
import { mensajeDeEntrada } from '../src/auth/mensajes';
import {
  caminoDeInvitacion,
  esCuentaExistente,
  mensajeDeInvitacion,
  tokenDelEnlace,
} from '../src/auth/recuperacion';
import { tema } from '../src/tema';

const LARGO_MINIMO = 10;

/**
 * Aceptar una invitación a un gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SON TRES CAMINOS, Y EL DE EN MEDIO ES EL QUE SE OLVIDA.                 │
 * │                                                                          │
 * │   sin sesión + cuenta nueva      -> crear la cuenta con el token         │
 * │   sin sesión + cuenta existente  -> entrar, y después vincular           │
 * │   con sesión                     -> vincular sin pedir nada              │
 * │                                                                          │
 * │ El segundo no se elige: lo descubre el servidor con un 409 al intentar   │
 * │ crear. Y la vuelta desde «entrar» lleva SIEMPRE a «crear», porque el     │
 * │ formulario de entrar no puede crear la cuenta que falta: al revés, quien │
 * │ todavía no tiene cuenta se queda encallado mirándolo.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VINCULAR NO CAMBIA DE GIMNASIO ACTIVO, Y NO ES UN OLVIDO.               │
 * │                                                                          │
 * │ `link-invitation` devuelve el gimnasio al que se acaba de entrar pero NO │
 * │ lo activa: quién decide dónde opera es la persona, con `switch-gym`. Por │
 * │ eso aquí se dice a qué gimnasio se ha entrado y se deja que la puerta    │
 * │ haga lo suyo — que con dos gimnasios es ofrecer el selector.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Invitacion() {
  const parametros = useLocalSearchParams<{ token?: string }>();
  const token = tokenDelEnlace(parametros.token);
  const { estado, revisar } = useSesion();
  const [eligio, setEligio] = useState<'crear' | 'entrar'>('crear');

  const fase =
    estado.tipo === 'cargando'
      ? 'cargando'
      : estado.tipo === 'sinSesion'
        ? 'sinSesion'
        : 'conSesion';

  const camino = caminoDeInvitacion(token, fase, eligio);

  if (camino === 'sinEnlace') {
    return (
      <PantallaDeAcceso
        titulo="Falta el enlace de invitación"
        entradilla="Abre el enlace tal y como te llegó en el correo, sin recortarlo. Si lo has copiado a mano, puede que se haya perdido un trozo."
      >
        <Enlace texto="Ir a entrar" a="/entrar" />
      </PantallaDeAcceso>
    );
  }

  if (camino === 'esperando') {
    return <PantallaDeAcceso titulo="Comprobando tu sesión…">{null}</PantallaDeAcceso>;
  }

  if (camino === 'vincular') {
    return <Vincular token={token!} yo={estado.tipo === 'cargando' ? null : estado} alTerminar={revisar} />;
  }

  return camino === 'crear' ? (
    <CrearCuenta token={token!} alDescubrirCuenta={() => setEligio('entrar')} alTerminar={revisar} />
  ) : (
    <EntrarYVincular alVolverACrear={() => setEligio('crear')} />
  );
}

/** Camino 1: la cuenta no existe. Se crea con la contraseña que elija. */
function CrearCuenta({
  token,
  alDescubrirCuenta,
  alTerminar,
}: {
  token: string;
  alDescubrirCuenta: () => void;
  alTerminar: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const listo = nombre.trim().length > 0 && clave.length >= LARGO_MINIMO && !enviando;

  async function enviar() {
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      await aceptarInvitacion({ token, name: nombre.trim(), password: clave });
      // El login queda hecho: `accept-invitation` devuelve sesión.
      await alTerminar();
    } catch (problema) {
      // Un 409 NO es un error: dice que ese correo ya tiene cuenta.
      if (esCuentaExistente(problema)) {
        alDescubrirCuenta();
        return;
      }
      setError(mensajeDeInvitacion(problema));
      setEnviando(false);
    }
  }

  return (
    <PantallaDeAcceso
      titulo="Te han invitado a RINDA"
      entradilla="Crea tu cuenta para entrar en el gimnasio que te ha invitado."
    >
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      <Campo
        etiqueta="Tu nombre"
        valor={nombre}
        alCambiar={setNombre}
        autoComplete="name"
        returnKeyType="next"
        deshabilitado={enviando}
      />
      <Campo
        etiqueta="Contraseña"
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

      <Boton variante="primario" onPress={() => void enviar()} deshabilitado={!listo} cargando={enviando}>
        Crear mi cuenta
      </Boton>
    </PantallaDeAcceso>
  );
}

/**
 * Camino 2: ya existía la cuenta. Se entra, y después se vincula.
 *
 * NO recibe el token, y esa ausencia es deliberada: aquí solo se inicia
 * sesión. Al aparecer la sesión, el componente de arriba vuelve a decidir y
 * cae en `vincular`, que es quien tiene el token y quien lo usa. Si esta
 * pantalla también lo tuviera, habría dos sitios capaces de vincular.
 */
function EntrarYVincular({ alVolverACrear }: { alVolverACrear: () => void }) {
  const { entrar } = useSesion();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const listo = correo.trim().length > 0 && clave.length > 0 && !enviando;

  async function enviar() {
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      await entrar({ email: correo.trim(), password: clave });
      /*
       * Al haber sesión, el componente de arriba vuelve a decidir y cae en
       * `vincular`: no se navega a mano ni se llama aquí a `linkInvitation`.
       * Un solo sitio decide el camino.
       */
    } catch (problema) {
      setError(mensajeDeEntrada(problema));
      setEnviando(false);
    }
  }

  return (
    <PantallaDeAcceso
      titulo="Ese correo ya tiene cuenta"
      entradilla="Entra con ella y añadimos el gimnasio a tu cuenta. No hace falta crear otra."
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
        returnKeyType="next"
        deshabilitado={enviando}
      />
      <Campo
        etiqueta="Contraseña"
        valor={clave}
        alCambiar={setClave}
        secreto
        autoComplete="current-password"
        returnKeyType="done"
        onSubmitEditing={() => void enviar()}
        deshabilitado={enviando}
      />

      <Boton variante="primario" onPress={() => void enviar()} deshabilitado={!listo} cargando={enviando}>
        Entrar y aceptar
      </Boton>

      <Pressable
        onPress={alVolverACrear}
        accessibilityRole="button"
        style={({ pressed }) => [estilos.enlace, pressed && estilos.pulsado]}
      >
        <Text style={estilos.textoEnlace}>Es otra cuenta: crear una nueva</Text>
      </Pressable>
    </PantallaDeAcceso>
  );
}

/**
 * Camino 3: ya hay sesión. No se pide nada; se vincula.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL NOMBRE DEL GIMNASIO SALE DE LA SESIÓN, NO DE LA RESPUESTA.           │
 * │                                                                          │
 * │ `link-invitation` devuelve `{ ok, gymId }` y NADA más — comprobado en    │
 * │ `linkInvitationResponseSchema`. El nombre aparece al refrescar la        │
 * │ sesión, porque la pertenencia nueva ya está en `memberships`. Sacarlo    │
 * │ de ahí es además lo correcto: es la misma fuente que usa el resto de la  │
 * │ app para nombrar gimnasios.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function Vincular({
  token,
  yo,
  alTerminar,
}: {
  token: string;
  yo: EstadoDeSesion | null;
  alTerminar: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [vinculado, setVinculado] = useState<string | null>(null);

  async function vincular() {
    if (trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      const { gymId } = await vincularInvitacion({ token });
      // Primero se refresca: hasta entonces la pertenencia nueva no existe.
      await alTerminar();
      setVinculado(gymId);
    } catch (problema) {
      setError(mensajeDeInvitacion(problema));
    } finally {
      setTrabajando(false);
    }
  }

  if (vinculado !== null) {
    const nombre =
      yo && yo.tipo !== 'sinSesion' && 'yo' in yo
        ? yo.yo.memberships.find((m) => m.gymId === vinculado)?.gymName
        : undefined;
    return (
      <PantallaDeAcceso
        titulo="Ya estás dentro"
        entradilla={
          nombre
            ? `Se ha añadido ${nombre} a tu cuenta. Para trabajar ahí, elígelo como gimnasio activo.`
            : 'Se ha añadido el gimnasio a tu cuenta. Para trabajar ahí, elígelo como gimnasio activo.'
        }
      >
        <Boton variante="primario" onPress={() => router.replace('/')}>
          Continuar
        </Boton>
      </PantallaDeAcceso>
    );
  }

  return (
    <PantallaDeAcceso
      titulo="Aceptar la invitación"
      entradilla="Ya tienes la sesión abierta, así que solo hace falta añadir el gimnasio a tu cuenta."
    >
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
      <Boton variante="primario" onPress={() => void vincular()} cargando={trabajando}>
        Aceptar
      </Boton>
      <Enlace texto="Ahora no" a="/entrar" />
    </PantallaDeAcceso>
  );
}

function Enlace({ texto, a }: { texto: string; a: '/entrar' }) {
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
