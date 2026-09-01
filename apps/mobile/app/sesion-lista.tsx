import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Etiqueta } from '../src/componentes/etiqueta';
import { Marca } from '../src/componentes/marca';
import { Pantalla } from '../src/componentes/pantalla';
import { Tarjeta } from '../src/componentes/tarjeta';
import { useSesion } from '../src/auth/sesion';
import { tema } from '../src/tema';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO ES INICIO. ES UN RECIBO.                                        │
 * │                                                                          │
 * │ Existe para poder comprobar en un telefono de verdad que la sesion se ha │
 * │ establecido: quien eres, en que gimnasio, y que se puede salir. Se borra │
 * │ entera cuando exista la pantalla de Inicio.                              │
 * │                                                                          │
 * │ Por eso NO lleva datos de cuota ni de rutina aunque la API ya los daria: │
 * │ empezar a pintarlos aqui es como una pantalla temporal se queda.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function SesionLista() {
  const { estado, salir } = useSesion();
  if (estado.tipo !== 'autenticado') return <Redirect href="/" />;

  const activa = estado.yo.memberships.find((m) => m.gymId === estado.gymId);

  return (
    <Pantalla>
      <Marca tamano="pequeno" />

      <View style={estilos.cabecera}>
        <Text style={estilos.titulo}>Sesion lista</Text>
        <Etiqueta tono="exito">Verificada con el servidor</Etiqueta>
      </View>

      <Tarjeta>
        <Text style={estilos.etiqueta}>SOCIO</Text>
        <Text style={estilos.valor}>{estado.yo.user.name}</Text>
        <Text style={estilos.secundario}>{estado.yo.user.email}</Text>
      </Tarjeta>

      <Tarjeta>
        <Text style={estilos.etiqueta}>GIMNASIO ACTIVO</Text>
        <Text style={estilos.valor}>{activa ? activa.gymName : 'Sin nombre'}</Text>
      </Tarjeta>

      <Aviso tono="informacion">
        Pantalla temporal de M2. Inicio, Rutina y Carne llegan en las fases siguientes.
      </Aviso>

      <Boton onPress={() => void salir()}>Cerrar sesion</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  etiqueta: { ...tema.texto.meta, color: tema.color.textoSecundario, letterSpacing: 0.5 },
  valor: { ...tema.texto.h2, color: tema.color.texto },
  secundario: { ...tema.texto.secundario, color: tema.color.textoSecundario },
});
