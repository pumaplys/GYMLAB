import { Redirect } from 'expo-router';
import { useSesion } from '../src/auth/sesion';
import { Arranque } from '../src/componentes/arranque';

/**
 * El unico sitio que decide a donde va cada estado de sesion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MIENTRAS SE COMPRUEBA NO SE ENSEÑA EL LOGIN.                            │
 * │                                                                          │
 * │ Leer el token del almacen y preguntar al servidor tarda. Si en ese rato  │
 * │ se pintara la pantalla de entrar, quien ya tiene sesion la veria         │
 * │ aparecer y desaparecer en cada arranque — el parpadeo clasico de las     │
 * │ apps que deciden la ruta antes de saber la respuesta.                    │
 * │                                                                          │
 * │ `cargando` tiene pantalla propia: la de arranque.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Puerta() {
  const { estado } = useSesion();

  switch (estado.tipo) {
    case 'cargando':
      return <Arranque />;
    case 'sinSesion':
      return <Redirect href="/entrar" />;
    case 'requiereSeleccionGimnasio':
      return <Redirect href="/elegir-gimnasio" />;
    case 'rolNoAdmitido':
      return <Redirect href="/no-admitido" />;
    case 'errorAlComprobar':
      return <Redirect href="/problema" />;
    case 'autenticado':
      return <Redirect href="/sesion-lista" />;
  }
}
