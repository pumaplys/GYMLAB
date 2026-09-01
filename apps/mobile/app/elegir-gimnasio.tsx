import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Pantalla } from '../src/componentes/pantalla';
import { useSesion } from '../src/auth/sesion';
import { mensajeDeEntrada } from '../src/auth/mensajes';
import { tema } from '../src/tema';

/**
 * Elegir gimnasio.
 *
 * Funcional, no protagonista: una lista de botones. Se llega aqui cuando la
 * sesion no tiene gimnasio activo, que es lo que devuelve el servidor cuando
 * hay mas de una membresia (auth.service.ts:200).
 *
 * Solo se ofrecen los gimnasios donde se es SOCIO: elegir uno donde se es
 * entrenador dejaria fuera igualmente, y ofrecerlo seria enviar a un callejon.
 */
export default function ElegirGimnasio() {
  const { estado, elegirGimnasio, salir } = useSesion();
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (estado.tipo !== 'requiereSeleccionGimnasio') return <Redirect href="/" />;

  const unaSola = estado.opciones.length === 1;

  async function elegir(gymId: string) {
    if (eligiendo) return;
    setEligiendo(gymId);
    setError(null);
    try {
      await elegirGimnasio(gymId);
    } catch (problema) {
      setError(mensajeDeEntrada(problema));
      setEligiendo(null);
    }
  }

  return (
    <Pantalla>
      <View style={estilos.cabecera}>
        <Text style={estilos.titulo}>
          {unaSola ? 'Confirma tu gimnasio' : 'Elige tu gimnasio'}
        </Text>
        <Text style={estilos.entradilla}>
          {unaSola
            ? 'Tu sesion todavia no tiene gimnasio activo. Confirma para continuar.'
            : 'Eres socio en varios. Elige con cual quieres entrar.'}
        </Text>
      </View>

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      <View style={estilos.lista}>
        {estado.opciones.map((opcion) => (
          <Boton
            key={opcion.gymId}
            variante={unaSola ? 'primario' : 'secundario'}
            onPress={() => void elegir(opcion.gymId)}
            cargando={eligiendo === opcion.gymId}
            deshabilitado={eligiendo !== null && eligiendo !== opcion.gymId}
            accessibilityHint="Entra en este gimnasio"
          >
            {opcion.gymName}
          </Boton>
        ))}
      </View>

      <Boton variante="peligro" onPress={() => void salir()} deshabilitado={eligiendo !== null}>
        Cerrar sesion
      </Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { gap: tema.espacio.md },
  titulo: { ...tema.texto.h1, color: tema.color.texto },
  entradilla: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 22 },
  lista: { gap: tema.espacio.md },
});
