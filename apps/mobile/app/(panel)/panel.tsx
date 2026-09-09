import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Boton } from '../../src/componentes/boton';
import { FilaDeAccion } from '../../src/componentes/fila-de-accion';
import { Pantalla } from '../../src/componentes/pantalla';
import { useSesion } from '../../src/auth/sesion';
import { puedeEntrenar } from '../../src/entrenamiento/permisos';
import { puedeConfigurarLoLegal } from '../../src/legal/permisos';
import { RUTAS_INTERNAS } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * La casa del personal del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI HABIA UN COMENTARIO QUE DECIA QUE ESTA PANTALLA NO CRECERIA.       │
 * │                                                                          │
 * │ Decia que el movil se quedaba con lo que se hace DE PIE —escanear un     │
 * │ carne, mirar quien es alguien— y que todo lo demas «ya tiene sitio: el   │
 * │ panel web». Era una decision razonable y ya no es la del producto: cada  │
 * │ rol tiene que poder hacer en el movil lo mismo que hace en la web, con   │
 * │ los mismos permisos. La UI se adapta a 390 px; la capacidad no se        │
 * │ recorta por el tamaño de la pantalla.                                    │
 * │                                                                          │
 * │ Lo primero que entra es ENTRENAMIENTO, y solo para el DUEÑO: recepcion   │
 * │ comparte esta area pero no ese permiso —la API le contesta 403 a las     │
 * │ cuatro clases del modulo—. Por eso las dos filas van tras un `if` de     │
 * │ rol y ademas detras del gate del grupo `(entrenamiento)`.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Panel() {
  const { estado, salir } = useSesion();
  const gimnasio =
    estado.tipo === 'autenticado'
      ? estado.yo.memberships.find((m) => m.gymId === estado.gymId)?.gymName
      : undefined;
  // Dueño si, recepcion no. Es el mismo reparto que hace la API.
  const entrena = estado.tipo === 'autenticado' && puedeEntrenar(estado.rol);
  // Lo legal es solo del dueño. Recepcion no ve ni la fila.
  const configura = estado.tipo === 'autenticado' && puedeConfigurarLoLegal(estado.rol);

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

        {/*
          PARITY-2. El alta y los planes los comparten dueño y recepcion —el
          modulo de socios es `@Roles('owner', 'receptionist')`— asi que van
          fuera del `if` de entrenamiento. Dentro de Planes, crear y editar SI
          son del dueño, y eso lo decide esa pantalla.
        */}
        <FilaDeAccion
          titulo="Nuevo socio"
          detalle="Dar de alta a alguien en el gimnasio."
          icono="socios"
          alPulsar={() => router.push(RUTAS_INTERNAS.alta)}
        />
        <FilaDeAccion
          titulo="Planes"
          detalle="Los planes con los que se dan de alta las cuotas."
          icono="pagos"
          alPulsar={() => router.push(RUTAS_INTERNAS.planes)}
        />

        {/*
          PARITY-3. Las dos las comparten dueño y recepcion —el historial es
          `@Roles('owner','receptionist')` y la lista de personal tambien—.
          Dentro de Personal, retirar el acceso SI es del dueño, y eso lo
          decide esa pantalla.
        */}
        <FilaDeAccion
          titulo="Accesos"
          detalle="Quién ha pasado por la puerta y con qué resultado."
          icono="accesos"
          alPulsar={() => router.push(RUTAS_INTERNAS.accesos)}
        />
        <FilaDeAccion
          titulo="Personal"
          detalle="Quién trabaja en el gimnasio, y a quién se ha invitado."
          icono="socios"
          alPulsar={() => router.push(RUTAS_INTERNAS.personal)}
        />

        {/*
          PARITY-4. Solo el dueño: `LegalController` y `PrivacyDocumentController`
          son `@Roles('owner')` en la clase. En el panel web esta pantalla lleva
          ademas `<RutaPrivada roles={['owner']}>`, asi que aqui tampoco se le
          enseña a recepcion — y la pantalla lo vuelve a comprobar por dentro.
        */}
        {configura ? (
          <FilaDeAccion
            titulo="Configuración"
            detalle="Datos legales del responsable y documento de privacidad."
            icono="privacidad"
            alPulsar={() => router.push(RUTAS_INTERNAS.configuracion)}
          />
        ) : null}

        {entrena ? (
          <>
            <FilaDeAccion
              titulo="Rutinas"
              detalle="Crea y edita las rutinas del gimnasio."
              icono="rutina"
              alPulsar={() => router.push(RUTAS_INTERNAS.rutinas)}
            />
            <FilaDeAccion
              titulo="Ejercicios"
              detalle="La biblioteca con la que se montan las rutinas."
              icono="biblioteca"
              alPulsar={() => router.push(RUTAS_INTERNAS.ejercicios)}
            />
          </>
        ) : null}
      </View>

      <Boton onPress={() => void salir()}>Cerrar sesión</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  acciones: { gap: tema.espacio.md },
});
