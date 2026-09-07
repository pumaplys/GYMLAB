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
 * │ DOS ACCIONES, Y LAS DOS SE HACEN DE PIE.                                │
 * │                                                                          │
 * │ Escanear un carne en la puerta y responder «¿quién es esta persona y     │
 * │ está al corriente?» con alguien delante. Nada mas.                       │
 * │                                                                          │
 * │ No hay altas, ni cobros, ni planes, ni ajustes, ni cuadro de mando. Todo │
 * │ eso se hace sentado y ya tiene sitio: el panel web, que lo tiene         │
 * │ funcionando desde hace tiempo. Un menu con ocho destinos de los que seis │
 * │ llevan al mismo sitio que el navegador no seria un adelanto.             │
 * │                                                                          │
 * │ Lo que el web NO puede hacer es leer un QR con la camara del bolsillo ni │
 * │ acompañar a alguien por la sala. Eso es lo que hay aqui.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
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
        <FilaDeAccion
          titulo="Buscar socio"
          detalle="Por nombre, correo o número de socio."
          icono="buscar"
          alPulsar={() => router.push(RUTAS_INTERNAS.buscar)}
        />
      </View>

      <Boton onPress={() => void salir()}>Cerrar sesión</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  acciones: { gap: tema.espacio.md },
});
