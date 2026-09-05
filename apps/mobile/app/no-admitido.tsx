import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Pantalla } from '../src/componentes/pantalla';
import { useSesion } from '../src/auth/sesion';
import { tema } from '../src/tema';

/**
 * La cuenta es buena, pero esta app no es la suya.
 *
 * NO se dice que las credenciales fallan, porque no fallan: ha entrado bien.
 * Decirle lo contrario le haria probar la contrasena una y otra vez.
 */
export default function NoAdmitido() {
  const { estado, salir } = useSesion();
  if (estado.tipo !== 'rolNoAdmitido') return <Redirect href="/" />;

  return (
    <Pantalla>
      <View style={estilos.cabecera}>
        <Text style={estilos.titulo} accessibilityRole="header">Esta app es para socios</Text>
      </View>
      <Aviso tono="informacion">
        Has entrado correctamente, pero tu cuenta no figura como socio. Si trabajas en el gimnasio,
        tu sitio es el panel web.
      </Aviso>
      <Boton onPress={() => void salir()}>Cerrar sesión</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
});
