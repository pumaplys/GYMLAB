import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Pantalla } from '../src/componentes/pantalla';
import { useSesion } from '../src/auth/sesion';
import { mensajeDeRestauracion } from '../src/auth/mensajes';
import { tema } from '../src/tema';

/**
 * No se pudo comprobar la sesion, pero la sesion puede seguir siendo buena.
 *
 * El token NO se ha borrado: reintentar basta. Cerrar sesion se ofrece igual
 * porque quien quiera entrar con otra cuenta tiene que poder hacerlo aunque el
 * servidor este caido.
 */
export default function Problema() {
  const { estado, revisar, salir } = useSesion();
  const [reintentando, setReintentando] = useState(false);

  if (estado.tipo !== 'errorAlComprobar') return <Redirect href="/" />;

  async function reintentar() {
    if (reintentando) return;
    setReintentando(true);
    await revisar();
    setReintentando(false);
  }

  return (
    <Pantalla>
      <View style={estilos.cabecera}>
        <Text style={estilos.titulo} accessibilityRole="header">No hemos podido continuar</Text>
      </View>
      <Aviso tono="aviso">{mensajeDeRestauracion(estado.motivo)}</Aviso>
      <Text style={estilos.nota}>
        Tu sesión sigue guardada: no hace falta que vuelvas a entrar.
      </Text>
      <Boton variante="primario" onPress={() => void reintentar()} cargando={reintentando}>
        Reintentar
      </Boton>
      <Boton onPress={() => void salir()} deshabilitado={reintentando}>
        Cerrar sesión
      </Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  nota: { ...tema.texto.secundario, color: tema.color.textoSecundario },
});
