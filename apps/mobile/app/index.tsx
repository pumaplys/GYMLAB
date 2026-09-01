import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Aviso } from '../src/componentes/aviso';
import { Boton } from '../src/componentes/boton';
import { Dato } from '../src/componentes/dato';
import { Etiqueta } from '../src/componentes/etiqueta';
import { Pantalla } from '../src/componentes/pantalla';
import { Tarjeta } from '../src/componentes/tarjeta';
import { useSesion } from '../src/auth/sesion';
import { tema } from '../src/tema';

/**
 * La unica ruta de M1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO ES LA PANTALLA DE INICIO DEL PRODUCTO.                          │
 * │                                                                          │
 * │ Es el marcador de posicion de los cimientos: enseña en que estado esta   │
 * │ la sesion y, cuando no hay ninguna, sirve de banco de pruebas del        │
 * │ sistema visual. Se sustituye entera en cuanto exista el login real.      │
 * │                                                                          │
 * │ No se ha hecho una ruta de demo aparte a proposito: habria que excluirla │
 * │ del build de produccion, y una ruta que existe pero no debe existir es   │
 * │ justo el tipo de cosa que se olvida. Aqui desaparece sola al sustituir   │
 * │ el fichero.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Indice() {
  const { estado, salir, revisar, elegirGimnasio } = useSesion();

  if (estado.tipo === 'cargando') {
    return (
      <Pantalla desplazable={false}>
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
          <Text style={estilos.secundario}>Comprobando tu sesion…</Text>
        </View>
      </Pantalla>
    );
  }

  if (estado.tipo === 'errorAlComprobar') {
    // Los tres motivos conservan el token: la sesion puede seguir siendo buena.
    const titulo = estado.motivo === 'red' ? 'Sin conexion' : 'No hemos podido comprobar tu sesion';
    const detalle =
      estado.motivo === 'red'
        ? 'No hemos podido hablar con el servidor.'
        : estado.motivo === 'servidor'
          ? `El servidor respondio ${estado.status}.`
          : 'La respuesta del servidor no era la esperada.';

    return (
      <Pantalla>
        <Text style={estilos.h1}>{titulo}</Text>
        <Aviso tono="aviso">{`${detalle} Tu sesion sigue guardada: no hace falta que vuelvas a entrar.`}</Aviso>
        <Boton variante="primario" onPress={() => void revisar()}>
          Reintentar
        </Boton>
      </Pantalla>
    );
  }

  if (estado.tipo === 'requiereSeleccionGimnasio') {
    // La pantalla de verdad es de M2. Aqui solo se demuestra que el estado
    // existe, que llega la lista y que `switchGym` lo resuelve.
    return (
      <Pantalla>
        <Text style={estilos.h1}>¿En que gimnasio?</Text>
        <Aviso tono="informacion">
          Eres socio en mas de un gimnasio y tu sesion todavia no tiene uno activo. Elige uno para
          continuar.
        </Aviso>
        {estado.opciones.map((opcion) => (
          <Boton key={opcion.gymId} onPress={() => void elegirGimnasio(opcion.gymId)}>
            {opcion.gymName}
          </Boton>
        ))}
        <Boton variante="peligro" onPress={() => void salir()}>
          Cerrar sesion
        </Boton>
      </Pantalla>
    );
  }

  if (estado.tipo === 'rolNoAdmitido') {
    return (
      <Pantalla>
        <Text style={estilos.h1}>Esta app es para socios</Text>
        <Aviso tono="informacion">
          Tu cuenta existe y la contrasena es correcta, pero en este gimnasio no figuras como
          socio. El personal trabaja desde el panel web.
        </Aviso>
        <Boton onPress={() => void salir()}>Cerrar sesion</Boton>
      </Pantalla>
    );
  }

  if (estado.tipo === 'autenticado') {
    return (
      <Pantalla>
        <Text style={estilos.h1}>Hola, {estado.yo.user.name.split(' ')[0]}</Text>
        <Aviso tono="exito">
          Sesion verificada contra el servidor. Las pantallas del producto llegan en M2.
        </Aviso>
        <Boton onPress={() => void salir()}>Cerrar sesion</Boton>
      </Pantalla>
    );
  }

  return <BancoDePruebas />;
}

/**
 * Lo que se ve sin sesion: el sistema visual de M1, para poder revisarlo.
 *
 * Cada pieza aparece en sus estados, que es lo unico que se puede juzgar
 * mirando. Aqui NO hay datos de producto ni se llama a la API.
 */
function BancoDePruebas() {
  return (
    <Pantalla>
      <View>
        <Text style={estilos.display}>GYMLAB</Text>
        <Text style={estilos.secundario}>M1 — cimientos y sistema visual</Text>
      </View>

      <Tarjeta>
        <Text style={estilos.h2}>Datos</Text>
        <View style={estilos.fila}>
          <Dato valor="21" etiqueta="Dias restantes" destacado />
          <Dato valor="78,6" unidad="kg" etiqueta="Peso" />
          <Dato valor="35,00" unidad="€" etiqueta="Cuota" />
        </View>
      </Tarjeta>

      <Tarjeta>
        <Text style={estilos.h2}>Estados</Text>
        <View style={estilos.filaEnvolvente}>
          <Etiqueta tono="exito">Al corriente</Etiqueta>
          <Etiqueta tono="aviso">Por vencer</Etiqueta>
          <Etiqueta tono="peligro">Vencida</Etiqueta>
          <Etiqueta tono="neutro">Archivada</Etiqueta>
          <Etiqueta tono="acento">Activa</Etiqueta>
        </View>
      </Tarjeta>

      <Tarjeta alta>
        <Text style={estilos.h2}>Acciones</Text>
        <Text style={estilos.secundario}>
          Un solo boton lima por pantalla. Los demas usan superficie.
        </Text>
        <Boton variante="primario" onPress={() => {}}>
          Mostrar mi codigo
        </Boton>
        <Boton onPress={() => {}}>Ver mi rutina</Boton>
        <Boton variante="peligro" onPress={() => {}}>
          Retirar mi autorizacion
        </Boton>
        <Boton onPress={() => {}} deshabilitado>
          Deshabilitado
        </Boton>
        <Boton variante="primario" onPress={() => {}} cargando>
          Cargando
        </Boton>
      </Tarjeta>

      <Aviso tono="informacion">Informacion neutra sobre lo que ocurre.</Aviso>
      <Aviso tono="exito">Se ha guardado correctamente.</Aviso>
      <Aviso tono="aviso">Tu cuota vence en tres dias.</Aviso>
      <Aviso tono="peligro">No hemos podido registrar el pago.</Aviso>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  display: { ...tema.texto.display, color: tema.color.texto },
  h1: { ...tema.texto.h1, color: tema.color.texto },
  h2: { ...tema.texto.h2, color: tema.color.texto },
  secundario: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  fila: { flexDirection: 'row', gap: tema.espacio.xl },
  filaEnvolvente: { flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.sm },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tema.espacio.md },
});
