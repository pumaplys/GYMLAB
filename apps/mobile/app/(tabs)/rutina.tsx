import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { EjercicioDeRutina } from '../../src/componentes/ejercicio-de-rutina';
import { Pantalla } from '../../src/componentes/pantalla';
import { SelectorDeRutina } from '../../src/componentes/selector-de-rutina';
import { clasificarError } from '../../src/auth/clasificar';
import { useSesion } from '../../src/auth/sesion';
import { cargarRutinas } from '../../src/rutina/fuente';
import {
  cuentaDeEjercicios,
  ejerciciosEnOrden,
  vistaDeRutina,
  type EstadoDeCarga,
} from '../../src/rutina/logica';
import { tema } from '../../src/tema';

/**
 * Rutina.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE LEE ENTRE SERIE Y SERIE, DE PIE Y CON UNA MANO.                      │
 * │                                                                          │
 * │ No es un panel de entrenamiento: es una CONSULTA. Quien la abre esta     │
 * │ sudando, con una barra al lado y quince segundos, y lo que necesita      │
 * │ saber es "por cual voy" y "cuantas me quedan". Todo lo demas estorba.    │
 * │                                                                          │
 * │ De ahi la jerarquia: numero, nombre, numeros grandes. Sin tablas, sin    │
 * │ una tarjeta por ejercicio y sin adornos entre el ojo y la cifra.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO HAY RUTA `/rutina/:id`, Y NO HACE FALTA.                             │
 * │                                                                          │
 * │ `/me/routines` devuelve las rutinas vigentes ENTERAS, con sus ejercicios │
 * │ dentro: no existe un endpoint de detalle que justifique una segunda      │
 * │ pantalla. Elegir cual se mira y mirarla son el mismo sitio, y asi        │
 * │ cambiar de rutina es un toque en lugar de ir y volver.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO EXISTE "TU RUTINA DE HOY".                                           │
 * │                                                                          │
 * │ El modelo no tiene dia, ni bloque, ni semana, ni sesion, ni marca de     │
 * │ principal. Con varias rutinas se pregunta cual quieres ver; nunca se     │
 * │ abre una por su cuenta llamandola la actual.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Rutina() {
  const { revisar } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga>({ fase: 'cargando' });
  const [refrescando, setRefrescando] = useState(false);

  /**
   * La rutina que el usuario esta MIRANDO. No es la rutina activa del sistema.
   *
   * Es estado de interfaz y solo de interfaz: no se persiste, no se manda al
   * servidor y se pierde al salir de la app, porque el backend no tiene donde
   * apuntar una preferencia asi y fabricarsela aqui la convertiria en una
   * decision de negocio que nadie ha tomado.
   */
  const [rutinaSeleccionadaId, setRutinaSeleccionadaId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCarga({ fase: 'ok', rutinas: await cargarRutinas() });
    } catch (problema) {
      /*
       * 401 NO se trata aqui: se devuelve a la politica global de M1, que es
       * la unica que decide si un token deja de valer. `revisar()` vuelve a
       * preguntar por la sesion y, si ya no vale, la app entera sale al login.
       *
       * Un 500 o un fallo de red, en cambio, NO tumban la sesion: son un error
       * de esta pantalla con su reintento.
       */
      if (clasificarError(problema).clase === 'sesionInvalida') {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo', mensaje: 'No pudimos cargar tus rutinas.' });
    }
  }, [revisar]);

  /*
   * Al entrar en la pestaña se pide una vez. Sin sondeo: una rutina la cambia
   * un entrenador cada varias semanas, asi que volver a la pantalla es momento
   * de sobra para tener el dato al dia.
   */
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const refrescar = useCallback(() => {
    setRefrescando(true);
    void cargar().finally(() => setRefrescando(false));
  }, [cargar]);

  if (carga.fase === 'cargando') return <Cargando />;

  if (carga.fase === 'fallo') {
    return (
      <Pantalla titulo="Rutina" descriptor="Tu entrenamiento">
        <Aviso tono="peligro">{carga.mensaje}</Aviso>
        <Boton variante="primario" onPress={() => void cargar()}>
          Reintentar
        </Boton>
      </Pantalla>
    );
  }

  /*
   * La vista se DERIVA de los datos frescos y del id mirado. Ese es todo el
   * mecanismo del refresco: si la rutina que se miraba sigue estando, se sigue
   * mirando; si el entrenador la retiro, se vuelve solo a la eleccion. Sin
   * efectos que sincronicen dos estados, y sin caer nunca en "le pongo la
   * primera".
   */
  const vista = vistaDeRutina(carga.rutinas, rutinaSeleccionadaId);

  if (vista.tipo === 'sinRutinas') {
    return (
      <Pantalla titulo="Rutina" descriptor="Tu entrenamiento" alRefrescar={refrescar} refrescando={refrescando}>
        {/*
          Sin boton: el socio no puede crearse una rutina, y ofrecerselo seria
          prometer algo que no existe. Se le dice quien si puede.
        */}
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTitulo}>Aun no tienes una rutina asignada.</Text>
          <Text style={estilos.vacioTexto}>
            Cuando tu entrenador te asigne una, aparecera aqui.
          </Text>
        </View>
      </Pantalla>
    );
  }

  return (
    <Pantalla
      titulo="Rutina"
      descriptor="Tu entrenamiento"
      alRefrescar={refrescar}
      refrescando={refrescando}
    >
      {/*
        La eleccion, arriba del todo: con varias rutinas es lo primero que hay
        que resolver, y se queda visible para poder cambiar sin volver atras.

        La frase va ANTES de las filas: puesta debajo, la pantalla parecia que
        se habia quedado a medio cargar —dos cajas y un texto suelto sobre
        seiscientos pixeles vacios—. Delante es lo que es: una instruccion y
        sus opciones.
      */}
      {vista.tipo === 'eligiendo' ? (
        <Text style={estilos.pista}>Elige una rutina para ver sus ejercicios.</Text>
      ) : null}

      {vista.tipo === 'eligiendo' || vista.sePuedeCambiar ? (
        <SelectorDeRutina
          rutinas={vista.rutinas}
          seleccionadaId={vista.tipo === 'mirando' ? vista.mirada.id : null}
          alElegir={setRutinaSeleccionadaId}
        />
      ) : null}

      {vista.tipo === 'eligiendo' ? null : (
        <View style={estilos.rutina}>
          <View style={estilos.cabecera}>
            <Text style={estilos.nombre} accessibilityRole="header">
              {vista.mirada.name}
            </Text>
            <Text style={estilos.cuenta}>{cuentaDeEjercicios(vista.mirada)}</Text>
            {/*
              La descripcion, si la hay. No se muestra `assignedAt`: es un
              instante —la API lo emite con `toISOString()` sobre un
              `timestamptz`— y saber que te la asignaron el 19 de agosto no
              ayuda a hacer la serie que toca ahora.
            */}
            {vista.mirada.description ? (
              <Text style={estilos.descripcion}>{vista.mirada.description}</Text>
            ) : null}
          </View>

          {/*
            Los ejercicios, en una lista simple dentro del ScrollView de
            `Pantalla`.

            SIN `FlatList`: el contrato limita una rutina a 50 ejercicios
            (`items` es `.min(1).max(50)`) y en el fixture la mas larga tiene 6,
            asi que virtualizar cincuenta filas de texto no compra nada. Y una
            `FlatList` dentro de un `ScrollView` es justo el anidamiento que
            rompe la virtualizacion en React Native: se ganaria el aviso sin
            ganar el beneficio.
          */}
          <View>
            {ejerciciosEnOrden(vista.mirada).map((item, indice) => (
              <EjercicioDeRutina
                key={item.id}
                item={item}
                indice={indice}
                primero={indice === 0}
              />
            ))}
          </View>
        </View>
      )}
    </Pantalla>
  );
}

/**
 * La espera.
 *
 * Reserva la cabecera y TRES filas con la forma de un ejercicio —numero,
 * nombre, datos— para que la lista no salte cuando llegan los datos. Ni diez
 * esqueletos ni animacion: es medio segundo, y algo parpadeando en una
 * pantalla que se mira de reojo molesta mas de lo que informa.
 */
function Cargando() {
  return (
    <Pantalla titulo="Rutina" descriptor="Tu entrenamiento">
      <View accessible accessibilityLabel="Cargando tu rutina">
        {/*
          El nombre de la rutina y su cuenta, reservados.

          Medido: sin este bloque el primer ejercicio aparecia 67 px mas abajo
          de donde estaba el primer hueco, y la lista entera daba un salto al
          llegar los datos.
        */}
        <View style={estilos.huecoCabeceraDeRutina}>
          <View style={estilos.huecoTitulo} />
          <View style={estilos.huecoCuenta} />
        </View>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[estilos.hueco, i === 0 && estilos.huecoPrimero]}>
            <View style={estilos.huecoCabecera}>
              <View style={estilos.huecoNumero} />
              <View style={estilos.huecoNombre} />
            </View>
            <View style={estilos.huecoDatos} />
          </View>
        ))}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  rutina: { gap: tema.espacio.lg },
  cabecera: { gap: tema.espacio.xs },
  nombre: { ...tema.texto.h1, color: tema.color.texto },
  cuenta: {
    ...tema.texto.meta,
    fontWeight: '600',
    letterSpacing: 1,
    color: tema.color.textoSecundario,
  },
  descripcion: {
    ...tema.texto.secundario,
    color: tema.color.textoSecundario,
    lineHeight: 20,
    marginTop: tema.espacio.xs,
  },
  pista: { ...tema.texto.secundario, color: tema.color.textoSecundario },

  vacio: { gap: tema.espacio.sm },
  vacioTitulo: { ...tema.texto.h3, color: tema.color.texto },
  vacioTexto: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },

  hueco: {
    paddingVertical: tema.espacio.lg,
    gap: tema.espacio.md,
    borderTopWidth: 1,
    borderTopColor: tema.color.borde,
  },
  huecoPrimero: { borderTopWidth: 0, paddingTop: 0 },
  huecoCabeceraDeRutina: { gap: tema.espacio.xs, marginBottom: tema.espacio.lg },
  huecoTitulo: { width: '62%', height: 34, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoCuenta: { width: '28%', height: 16, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoCabecera: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.md },
  huecoNumero: { width: 32, height: 26, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoNombre: { flex: 1, height: 26, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoDatos: {
    marginLeft: 32 + tema.espacio.md,
    width: '55%',
    height: 49,
    borderRadius: 4,
    backgroundColor: tema.color.superficie,
  },
});
