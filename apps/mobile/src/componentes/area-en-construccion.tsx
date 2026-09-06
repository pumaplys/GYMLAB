import { StyleSheet, Text, View } from 'react-native';
import { Boton } from './boton';
import { Pantalla } from './pantalla';
import { useSesion } from '../auth/sesion';
import { tema } from '../tema';

/**
 * El sitio de un area que todavia no tiene pantallas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ENSEÑA DATOS. NI DE MUESTRA, NI "APROXIMADOS", NI UN PANEL VACIO.    │
 * │                                                                          │
 * │ Un marcador con cifras inventadas deja de ser un marcador: se enseña, se │
 * │ comenta, y alguien acaba preguntando por que el numero no cuadra. Lo     │
 * │ unico que dice es que esta cuenta YA ENTRA en la app y que su parte      │
 * │ llega despues.                                                           │
 * │                                                                          │
 * │ Es lo que separa STAFF-1 de las fases siguientes: aqui se arregla QUIEN  │
 * │ puede entrar y A DONDE va; lo que hay dentro es otra conversacion.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Lleva "Cerrar sesion" porque sin ella esta pantalla seria un callejon: no
 * hay pestañas debajo ni nada que pulsar, y quien entre por error se quedaria
 * atrapado hasta desinstalar la app.
 */
export function AreaEnConstruccion({ titulo, quien }: { titulo: string; quien: string }) {
  const { estado, salir } = useSesion();
  const gimnasio =
    estado.tipo === 'autenticado'
      ? estado.yo.memberships.find((m) => m.gymId === estado.gymId)?.gymName
      : undefined;

  return (
    <Pantalla>
      <View style={estilos.bloque}>
        <Text style={estilos.titulo} accessibilityRole="header">
          {titulo}
        </Text>
        <View style={estilos.carril}>
          <View style={estilos.carrilAcento} />
          <View style={estilos.carrilResto} />
        </View>
        {gimnasio ? <Text style={estilos.gimnasio}>{gimnasio}</Text> : null}
        <Text style={estilos.texto}>
          Has entrado como {quien}. Tu parte de la app todavía no está aquí: de momento se gestiona
          desde el panel web.
        </Text>
      </View>

      <Boton onPress={() => void salir()}>Cerrar sesión</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  carril: { flexDirection: 'row', alignItems: 'center', height: 3 },
  carrilAcento: { width: 44, height: 3, borderRadius: 2, backgroundColor: tema.color.acento },
  carrilResto: { flex: 1, height: 1, backgroundColor: tema.color.borde },
  gimnasio: { ...tema.texto.h3, color: tema.color.texto },
  texto: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 24 },
});
