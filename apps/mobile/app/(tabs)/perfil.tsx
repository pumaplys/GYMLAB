import { View } from 'react-native';
import { StyleSheet } from 'react-native';
import { Boton } from '../../src/componentes/boton';
import { Marcador } from '../../src/componentes/marcador';
import { Pantalla } from '../../src/componentes/pantalla';
import { useSesion } from '../../src/auth/sesion';
import { tema } from '../../src/tema';

/**
 * Perfil. Marcador de M3, con una excepcion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CERRAR SESION SI ESTA, Y NO ES ADELANTARSE.                             │
 * │                                                                          │
 * │ La pantalla temporal de M2 —"sesion lista"— desaparece en M3 porque ya   │
 * │ existe Inicio, y era el unico sitio desde el que se podia salir. Sin      │
 * │ esto, quien entra se queda dentro: no hay forma de cambiar de cuenta ni   │
 * │ de dejar el telefono a otra persona.                                     │
 * │                                                                          │
 * │ Es la accion, no la pantalla: Perfil de verdad llega despues.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE VIENE, Y DONDE VA A VIVIR.                                       │
 * │                                                                          │
 * │ Pagos, Accesos y Privacidad NO son destinos de la barra: son secciones   │
 * │ dentro de Perfil, y la barra tiene cinco sitios ya decididos. Con Expo    │
 * │ Router la forma limpia es sacarlas del grupo `(tabs)`:                    │
 * │                                                                          │
 * │   app/perfil/pagos.tsx       -> /perfil/pagos                            │
 * │   app/perfil/accesos.tsx     -> /perfil/accesos                          │
 * │   app/perfil/privacidad.tsx  -> /perfil/privacidad                       │
 * │                                                                          │
 * │ Fuera del grupo, asi que se APILAN encima de las pestañas en lugar de    │
 * │ convertirse en una sexta: se entra, se vuelve, y la barra no cambia. Y   │
 * │ no chocan con esta ruta: `app/perfil/` sin `index.tsx` no ocupa          │
 * │ "/perfil", que es de la pestaña.                                        │
 * │                                                                          │
 * │ NO se crean todavia: una ruta vacia es una ruta que alguien enlaza.      │
 * │                                                                          │
 * │ Editar el perfil NO entra: la API no ofrece ese endpoint. Ver M0.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Perfil() {
  const { salir } = useSesion();

  return (
    <Pantalla titulo="Perfil" descriptor="Tu cuenta">
      <Marcador fase="M8" />
      <View style={estilos.hueco} />
      <Boton onPress={() => void salir()}>Cerrar sesion</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  hueco: { flex: 1, minHeight: tema.espacio.xl },
});
