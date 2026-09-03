import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { Etiqueta } from '../../src/componentes/etiqueta';
import { FilaDeAccion } from '../../src/componentes/fila-de-accion';
import { Pantalla } from '../../src/componentes/pantalla';
import { Tarjeta } from '../../src/componentes/tarjeta';
import { useSesion } from '../../src/auth/sesion';
import { mensajeDeEntrada } from '../../src/auth/mensajes';
import { avisaDeQueLaPuertaPuedeNegar, lecturaDeCuota } from '../../src/cuota/lectura';
import { RUTAS_DE_TABS } from '../../src/navegacion/destinos';
import { cargarEsenciales, cargarProgreso, cargarRutinas } from '../../src/inicio/fuente';
import {
  fechaCorta,
  presentacionDeRutinas,
  resumenDeProgreso,
  saludo,
  type DatosDeInicio,
} from '../../src/inicio/logica';
import { tema } from '../../src/tema';

/**
 * Inicio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES EL RESUMEN DE UNA CUENTA. ES "¿QUE NECESITO AHORA?".              │
 * │                                                                          │
 * │ El panel web informa: enseña tus datos, tu cuota y tus datos de salud.   │
 * │ Aqui la pregunta es otra. Quien abre la app suele estar de pie, con una  │
 * │ mano, y casi siempre quiere lo mismo: entrar al gimnasio. Por eso la     │
 * │ accion principal es abrir el carne y esta arriba, grande y sola.        │
 * │                                                                          │
 * │ Y no hay ni una cifra inventada. Se pidieron /me/stats, /me/streak,      │
 * │ /me/workouts, /me/goals, /me/summary y /me/home: los seis dan 404. No    │
 * │ existen calorias, rachas, entrenamientos completados ni objetivos, asi   │
 * │ que no aparecen.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN FALLO EN LAS RUTINAS NO TUMBA LA PANTALLA.                           │
 * │                                                                          │
 * │ La ficha y la cuota son esenciales: sin ellas no hay nada honesto que    │
 * │ enseñar. Las rutinas y el progreso degradan por su cuenta — quien abre   │
 * │ la app para enseñar el carne no deberia encontrarse un error porque el   │
 * │ listado de rutinas dio un 500.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Inicio() {
  const { estado: sesion } = useSesion();
  const [datos, setDatos] = useState<DatosDeInicio>({
    esenciales: { estado: 'cargando' },
    rutinas: { estado: 'cargando' },
    progreso: { estado: 'cargando' },
  });
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gimnasio =
    sesion.tipo === 'autenticado'
      ? sesion.yo.memberships.find((m) => m.gymId === sesion.gymId)?.gymName
      : undefined;

  /**
   * Las tres peticiones, cada una con su suerte.
   *
   * `allSettled` y no `all`: con `all`, el primer rechazo descarta tambien las
   * respuestas que SI llegaron, y entonces un fallo en el progreso borraria el
   * saludo.
   */
  const cargar = useCallback(async () => {
    setError(null);
    const [esenciales, rutinas, progreso] = await Promise.allSettled([
      cargarEsenciales(),
      cargarRutinas(),
      cargarProgreso(),
    ]);

    if (esenciales.status === 'rejected') setError(mensajeDeEntrada(esenciales.reason));

    setDatos({
      esenciales:
        esenciales.status === 'fulfilled'
          ? { estado: 'ok', datos: esenciales.value }
          : { estado: 'fallo' },
      rutinas:
        rutinas.status === 'fulfilled' ? { estado: 'ok', datos: rutinas.value } : { estado: 'fallo' },
      progreso:
        progreso.status === 'fulfilled'
          ? { estado: 'ok', datos: progreso.value }
          : { estado: 'fallo' },
    });
  }, []);

  /*
   * Al entrar en la pestaña se refresca UNA vez. Ni sondeo, ni AppState: nada
   * de esto caduca en segundos —la cuota cambia de dia en dia y una rutina la
   * cambia un entrenador— asi que volver a la pantalla es momento de sobra.
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

  if (datos.esenciales.estado === 'cargando') {
    return (
      <Pantalla>
        <View style={estilos.saludo}>
          <View style={estilos.esqueletoLinea} />
          <View style={[estilos.esqueletoLinea, estilos.esqueletoCorta]} />
        </View>
        <Text style={estilos.cargando}>Cargando tu inicio…</Text>
      </Pantalla>
    );
  }

  if (datos.esenciales.estado === 'fallo') {
    return (
      <Pantalla>
        <Text style={estilos.nombre}>Hola</Text>
        <Aviso tono="peligro">{error ?? 'No pudimos cargar tu inicio.'}</Aviso>
        <Boton variante="primario" onPress={() => void cargar()}>
          Reintentar
        </Boton>
      </Pantalla>
    );
  }

  const { ficha, cuota } = datos.esenciales.datos;
  const lectura = lecturaDeCuota(cuota);
  const rutinas = datos.rutinas.estado === 'ok' ? presentacionDeRutinas(datos.rutinas.datos) : null;
  const progreso =
    datos.progreso.estado === 'ok' ? resumenDeProgreso(datos.progreso.datos) : null;

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando}>
      {/* 1. Quien eres. Es lo unico de la pantalla que no es una accion. */}
      <View style={estilos.saludo}>
        <Text style={estilos.momento}>{saludo('').toUpperCase()}</Text>
        <Text style={estilos.nombre} accessibilityRole="header">
          {ficha.firstName}
        </Text>
        <Text style={estilos.meta}>
          {[gimnasio, `N.º ${ficha.memberNumber}`].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {/* 2. En que situacion estas. Una franja, no una tarjeta. */}
      <View style={estilos.franja}>
        <Etiqueta tono={lectura.tono}>{lectura.titulo}</Etiqueta>
        <Text style={estilos.franjaDetalle}>{detalleDeCuota(cuota)}</Text>
        {avisaDeQueLaPuertaPuedeNegar(cuota) ? (
          <Text style={estilos.aviso}>{lectura.explicacion}</Text>
        ) : null}
      </View>

      {/*
        3. LA accion.

        El carne y no la rutina, y no por gusto: con varias rutinas asignadas el
        modelo no dice cual es la principal, asi que no hay ninguna que poner
        aqui sin inventarla. El carne, en cambio, es siempre el mismo y es lo
        que se necesita de pie delante de un torno.

        NO se pinta el QR aqui: el codigo dura un minuto y se pide al entrar en
        Carne. Ver la politica de M4.
      */}
      <FilaDeAccion
        principal
        icono="carne"
        titulo="Abrir carne"
        detalle="Tu codigo para entrar"
        alPulsar={() => router.push(RUTAS_DE_TABS.carne)}
        accessibilityHint="Abre tu carne digital"
      />

      {/* 4. La rutina. */}
      {datos.rutinas.estado === 'fallo' ? (
        <Aviso tono="aviso">No pudimos cargar tus rutinas. El resto de tu inicio sigue aqui.</Aviso>
      ) : rutinas?.tipo === 'una' ? (
        <Tarjeta>
          <Text style={estilos.rotulo}>TU RUTINA</Text>
          <Text style={estilos.tituloRutina}>{rutinas.rutina.nombre}</Text>
          <Text style={estilos.meta}>{ejerciciosEnPalabras(rutinas.rutina.ejercicios)}</Text>
          <View style={estilos.muestra}>
            {rutinas.muestra.map((e) => (
              <View key={e.nombre} style={estilos.ejercicio}>
                <Text style={estilos.ejercicioNombre} numberOfLines={1}>
                  {e.nombre}
                </Text>
                <Text style={estilos.ejercicioSeries}>{e.series}</Text>
              </View>
            ))}
          </View>
          <Boton onPress={() => router.push(RUTAS_DE_TABS.rutina)}>Ver rutina</Boton>
        </Tarjeta>
      ) : rutinas?.tipo === 'varias' ? (
        <Tarjeta>
          {/*
            Con varias NO se elige una: el modelo no tiene rutina principal y
            en el fixture las dos estaban asignadas el mismo dia, asi que ni
            "la mas reciente" desempata. Se enseñan las dos y elige quien sabe
            si hoy le toca hombro o pierna.
          */}
          <Text style={estilos.rotulo}>TUS RUTINAS</Text>
          <View style={estilos.lista}>
            {rutinas.rutinas.map((r) => (
              <View key={r.id}>
                <Text style={estilos.nombreRutina} numberOfLines={1}>
                  {r.nombre}
                </Text>
                {/*
                  El recuento con su palabra. Un "3" suelto al lado de un
                  nombre no dice si son ejercicios, series o semanas.
                */}
                <Text style={estilos.meta}>{ejerciciosEnPalabras(r.ejercicios)}</Text>
              </View>
            ))}
          </View>
          <Boton onPress={() => router.push(RUTAS_DE_TABS.rutina)}>Ver mis rutinas</Boton>
        </Tarjeta>
      ) : rutinas?.tipo === 'ninguna' ? (
        <Tarjeta>
          <Text style={estilos.rotulo}>TU RUTINA</Text>
          <Text style={estilos.vacio}>
            Todavia no tienes ninguna asignada. Tu entrenador puede prepararte una.
          </Text>
        </Tarjeta>
      ) : null}

      {/*
        5. El progreso, discreto.

        Se enseña QUE se midio y CUANDO, sin comparar: dos mediciones pueden
        venir de dos basculas distintas, y una flecha verde por 400 gramos es
        inventarse una tendencia.

        Sin mediciones NO hay tarjeta grande: solo una fila, o nada.
      */}
      {datos.progreso.estado === 'fallo' ? null : progreso?.tipo === 'ultima' ? (
        <Tarjeta>
          <Text style={estilos.rotulo}>ULTIMA MEDICION</Text>
          <Text style={estilos.meta}>{fechaCorta(progreso.fecha)}</Text>
          <View style={estilos.medidas}>
            {progreso.medidas.map((m) => (
              <View key={m.etiqueta} style={estilos.medida}>
                <Text style={estilos.medidaValor}>{m.valor}</Text>
                <Text style={estilos.medidaEtiqueta}>{m.etiqueta}</Text>
              </View>
            ))}
          </View>
          <Boton onPress={() => router.push(RUTAS_DE_TABS.progreso)}>Ver progreso</Boton>
        </Tarjeta>
      ) : progreso?.tipo === 'ninguno' ? (
        <FilaDeAccion
          icono="progreso"
          titulo="Sin mediciones todavia"
          detalle="Tu gimnasio las registra en tu ficha"
          alPulsar={() => router.push(RUTAS_DE_TABS.progreso)}
          accessibilityHint="Abre tu progreso"
        />
      ) : null}
    </Pantalla>
  );
}

/** "Mensual · hasta 20 sep 2026 · quedan 17 dias", con lo que exista. */
function detalleDeCuota(cuota: {
  planName: string | null;
  hasta: string | null;
  diasRestantes: number | null;
}): string {
  const partes: string[] = [];
  if (cuota.planName) partes.push(cuota.planName);
  if (cuota.hasta) partes.push(`hasta ${fechaCorta(cuota.hasta)}`);
  if (cuota.diasRestantes !== null) partes.push(diasEnPalabras(cuota.diasRestantes));
  return partes.join(' · ');
}

/**
 * Los dias, dichos como se dicen.
 *
 * `diasRestantes` es negativo cuando ya vencio, y "quedan -4 dias" no lo dice
 * nadie.
 */
function diasEnPalabras(dias: number): string {
  if (dias > 1) return `quedan ${dias} dias`;
  if (dias === 1) return 'queda 1 dia';
  if (dias === 0) return 'vence hoy';
  if (dias === -1) return 'vencio ayer';
  return `vencio hace ${Math.abs(dias)} dias`;
}

function ejerciciosEnPalabras(cuantos: number): string {
  return cuantos === 1 ? '1 ejercicio' : `${cuantos} ejercicios`;
}

const estilos = StyleSheet.create({
  saludo: { gap: 2 },
  momento: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: tema.color.textoSecundario,
  },
  nombre: { ...tema.texto.display, color: tema.color.texto },
  meta: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  cargando: { ...tema.texto.secundario, color: tema.color.textoSecundario },

  esqueletoLinea: {
    height: 30,
    width: '55%',
    borderRadius: tema.radio.campo,
    backgroundColor: tema.color.superficie,
  },
  esqueletoCorta: { height: 14, width: '35%', marginTop: tema.espacio.sm },

  franja: {
    gap: tema.espacio.sm,
    paddingLeft: tema.espacio.lg,
    // Un filete a la izquierda en lugar de una tarjeta: dice "estado" sin
    // añadir otra caja a una pantalla que ya tiene dos.
    borderLeftWidth: 3,
    borderLeftColor: tema.color.borde,
  },
  franjaDetalle: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  aviso: { ...tema.texto.secundario, color: tema.color.aviso, lineHeight: 20 },

  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    color: tema.color.textoSecundario,
  },
  tituloRutina: { ...tema.texto.h2, color: tema.color.texto },
  vacio: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },

  muestra: { gap: tema.espacio.sm, marginTop: tema.espacio.xs },
  ejercicio: { flexDirection: 'row', justifyContent: 'space-between', gap: tema.espacio.md },
  ejercicioNombre: { ...tema.texto.secundario, color: tema.color.texto, flexShrink: 1 },
  ejercicioSeries: { ...tema.texto.meta, fontWeight: '600', color: tema.color.secundario },

  lista: { gap: tema.espacio.md },
  nombreRutina: { ...tema.texto.cuerpo, fontWeight: '600', color: tema.color.texto, flexShrink: 1 },

  medidas: { flexDirection: 'row', gap: tema.espacio.xl, marginTop: tema.espacio.xs },
  medida: { gap: 2 },
  medidaValor: { ...tema.texto.h3, color: tema.color.texto },
  medidaEtiqueta: { ...tema.texto.meta, color: tema.color.textoSecundario },
});
