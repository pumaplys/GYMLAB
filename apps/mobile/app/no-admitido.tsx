import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Pantalla } from '../src/componentes/pantalla';
import { useSesion } from '../src/auth/sesion';
import { tema } from '../src/tema';

/**
 * La cuenta es buena, pero no pertenece a ningún gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTA PANTALLA DECIA «ESTA APP ES PARA SOCIOS», Y HACIA UN AÑO QUE NO ERA │
 * │ VERDAD.                                                                  │
 * │                                                                          │
 * │ Antes de STAFF-1 cualquier rol que no fuera `member` acababa aqui, y el  │
 * │ texto —«si trabajas en el gimnasio, tu sitio es el panel web»— era el    │
 * │ correcto. Desde entonces el rol NO decide si se entra: decide A DONDE,   │
 * │ y los cuatro tienen area. `resolverAcceso` solo llega aqui cuando        │
 * │ `gimnasiosDondePuedeEntrar` devuelve CERO, que es otra cosa: una cuenta  │
 * │ sin ninguna pertenencia vigente.                                         │
 * │                                                                          │
 * │ Es decir: a un dueño al que le acaban de retirar el acceso se le decia   │
 * │ que la app no era para el y que se fuera a la web. Lo encontro la        │
 * │ auditoria de PARITY-5 comparando estados con `SinGimnasios` del panel.   │
 * │                                                                          │
 * │ El nombre del estado —`rolNoAdmitido`— se queda por ahora: renombrarlo   │
 * │ toca la maquina de sesion y sus pruebas, y lo que lee una persona es     │
 * │ esto. Queda escrito para que no se lea como si el rol importara.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * NO se dice que las credenciales fallan, porque no fallan: ha entrado bien.
 * Decirle lo contrario le haria probar la contraseña una y otra vez.
 */
export default function NoAdmitido() {
  const { estado, salir } = useSesion();
  if (estado.tipo !== 'rolNoAdmitido') return <Redirect href="/" />;

  return (
    <Pantalla>
      <View style={estilos.cabecera}>
        <Text style={estilos.titulo} accessibilityRole="header">
          Tu cuenta no pertenece a ningún gimnasio
        </Text>
      </View>
      <Aviso tono="informacion">
        Has entrado correctamente. Puede que te hayan retirado el acceso, o que la invitación
        todavía no se haya aceptado. Habla con quien lleve el gimnasio.
      </Aviso>
      <Boton onPress={() => void salir()}>Cerrar sesión</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
});
