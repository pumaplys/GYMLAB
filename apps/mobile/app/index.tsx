import { Redirect } from 'expo-router';
import { useSesion } from '../src/auth/sesion';
import { Arranque } from '../src/componentes/arranque';
import { destinoDe } from '../src/navegacion/destinos';

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
 *
 * La decision en si vive en `navegacion/destinos.ts`, sin React, para poder
 * probarla. Aqui solo queda pintarla.
 */
export default function Puerta() {
  const { estado } = useSesion();
  const destino = destinoDe(estado);
  return destino ? <Redirect href={destino} /> : <Arranque />;
}
