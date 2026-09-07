import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Boton } from '../../src/componentes/boton';
import { FilaDeAccion } from '../../src/componentes/fila-de-accion';
import { Pantalla } from '../../src/componentes/pantalla';
import { useSesion } from '../../src/auth/sesion';
import { RUTAS_INTERNAS } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * La casa del personal del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA SOLA ACCION, Y ES LA QUE SE HACE DE PIE EN LA PUERTA.               │
 * │                                                                          │
 * │ No hay buscador de socios, ni cobros, ni historial, ni cuadro de mando.  │
 * │ Esas cosas se hacen sentado, y para eso ya esta el panel web — que las   │
 * │ tiene, funcionando, desde hace tiempo. Lo que el web NO puede hacer es   │
 * │ leer un QR con la camara del bolsillo, y eso es exactamente lo unico     │
 * │ que aporta esta pantalla.                                                │
 * │                                                                          │
 * │ Un menu con seis destinos de los que cinco no existen no seria un        │
 * │ adelanto: seria una promesa. Cuando haya una segunda cosa que hacer de   │
 * │ pie, se añade aqui.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * «Cerrar sesión» sigue estando por lo mismo que en el marcador que sustituye:
 * sin pestañas debajo, quien entre con la cuenta equivocada necesita una salida.
 */
export default function Panel() {
  const { estado, salir } = useSesion();
  const gimnasio =
    estado.tipo === 'autenticado'
      ? estado.yo.memberships.find((m) => m.gymId === estado.gymId)?.gymName
      : undefined;

  return (
    <Pantalla titulo="Panel" descriptor={gimnasio}>
      <View style={estilos.acciones}>
        <FilaDeAccion
          titulo="Escanear carné"
          detalle="Comprueba el carné de un socio en la puerta."
          icono="carne"
          principal
          alPulsar={() => router.push(RUTAS_INTERNAS.escaner)}
          accessibilityHint="Abre la cámara para leer el código del carné"
        />
      </View>

      <Boton onPress={() => void salir()}>Cerrar sesión</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  acciones: { gap: tema.espacio.md },
});
