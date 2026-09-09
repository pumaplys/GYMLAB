import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { GraficoDeProgreso, ALTO_DEL_TRAZO } from '../../src/componentes/grafico-de-progreso';
import { Pantalla } from '../../src/componentes/pantalla';
import { SelectorDeMetrica } from '../../src/componentes/selector-de-metrica';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { fechaDeInstante } from '../../src/formato/fecha';
import { cargarProgreso } from '../../src/progreso/fuente';
import {
  comoCambio,
  comoNumero,
  historial,
  lecturaDeCambio,
  lecturaDeFila,
  medidaDe,
  medidaVisible,
  medidasConDatos,
  otrasMedidas,
  resumenDeMedida,
  serieDe,
  type CampoDeMedida,
  type EstadoDeCarga,
} from '../../src/progreso/logica';
import { tema } from '../../src/tema';

/**
 * Progreso.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RESPONDE "¿COMO HAN CAMBIADO MIS MEDICIONES?" Y NADA MAS.               │
 * │                                                                          │
 * │ El panel web lista las mediciones una debajo de otra, que esta bien para │
 * │ consultar un dato concreto y no dice nada sobre el cambio. Aqui manda    │
 * │ una medida a la vez: su valor de ahora, cuanto se movio desde la         │
 * │ anterior, y la linea.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO SE INTERPRETA NADA. NI UNA VEZ.                                      │
 * │                                                                          │
 * │ Sin verde ni rojo en los cambios, sin flechas, sin "vas muy bien", sin   │
 * │ objetivo y sin peso ideal. Son datos de salud y quien los mide es un     │
 * │ entrenador: la app dice la resta, y el significado lo pone quien sabe    │
 * │ de su propio cuerpo.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Progreso() {
  const { revisar } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga>({ fase: 'cargando' });
  const [refrescando, setRefrescando] = useState(false);

  /**
   * La medida que se esta mirando. Estado de interfaz y solo de interfaz.
   *
   * No se persiste: el backend no tiene donde apuntar "esta persona prefiere
   * ver la cintura", y guardarlo en el telefono convertiria un gesto de
   * lectura en una preferencia que nadie ha decidido que exista.
   */
  const [metricaElegida, setMetricaElegida] = useState<CampoDeMedida | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCarga({ fase: 'ok', mediciones: await cargarProgreso() });
    } catch (problema) {
      // La MISMA politica que Inicio y Rutina. Un 401 lo decide la sesion; un
      // 500 o un corte de red son un error de esta pantalla, con su reintento.
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo', mensaje: 'No pudimos cargar tu progreso.' });
    }
  }, [revisar]);

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
      <Pantalla titulo="Progreso" descriptor="Tus mediciones">
        <Aviso tono="peligro">{carga.mensaje}</Aviso>
        <Boton variante="primario" onPress={() => void cargar()}>
          Reintentar
        </Boton>
      </Pantalla>
    );
  }

  const { mediciones } = carga;
  const disponibles = medidasConDatos(mediciones);
  /*
   * DERIVADA de los datos frescos, igual que en Rutina: si al refrescar la
   * medida que se miraba se queda sin puntos, se vuelve sola a la primera que
   * si los tiene. Sin efectos que sincronicen dos estados.
   */
  const campo = medidaVisible(mediciones, metricaElegida);

  if (!campo) {
    return (
      <Pantalla
        titulo="Progreso"
        descriptor="Tus mediciones"
        alRefrescar={refrescar}
        refrescando={refrescando}
      >
        {/*
          El estado que de verdad se va a ver: el fixture de la socia con
          cuenta tiene CERO mediciones. Sin grafico vacio, sin ceros y sin un
          boton que prometa registrar algo — en V1 quien mide es el entrenador.
        */}
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTitulo}>Aún no hay mediciones.</Text>
          <Text style={estilos.vacioTexto}>
            Cuando tu gimnasio registre tu peso o tus medidas, aparecerán aquí.
          </Text>
        </View>

        <PieDePrivacidad />
      </Pantalla>
    );
  }

  const medida = medidaDe(campo);
  const resumen = resumenDeMedida(serieDe(mediciones, campo));
  const otras = otrasMedidas(mediciones, campo);
  const filas = historial(mediciones);

  return (
    <Pantalla
      titulo="Progreso"
      descriptor="Tus mediciones"
      alRefrescar={refrescar}
      refrescando={refrescando}
      sinRellenoHorizontal
    >
      {/* Solo aparece si hay mas de una medida que enseñar. */}
      {disponibles.length > 1 ? (
        <SelectorDeMetrica medidas={disponibles} elegida={campo} alElegir={setMetricaElegida} />
      ) : null}

      <View style={estilos.cuerpo}>
        {resumen.tipo !== 'sinDatos' ? (
          <View style={estilos.hero}>
            <Text style={estilos.rotulo}>{medida.etiqueta.toUpperCase()}</Text>
            {/*
              La cifra y su unidad son UN elemento para el lector.
              Medido: por separado, VoiceOver leia "Peso: 71,4 kg" y despues
              "kg" otra vez, porque la unidad es un `Text` hermano.
            */}
            <View
              style={estilos.cifra}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${medida.etiqueta}: ${comoNumero(resumen.ultimo.valor)} ${medida.unidad}`}
            >
              {/* Tapados: su contenido ya esta en la etiqueta del grupo. */}
              <Text
                style={estilos.valor}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                aria-hidden
              >
                {comoNumero(resumen.ultimo.valor)}
              </Text>
              <Text
                style={estilos.unidad}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                aria-hidden
              >
                {medida.unidad}
              </Text>
            </View>

            {/*
              El cambio, en gris y sin flecha. Con una sola medicion NO se
              escribe: no hay con que comparar, y un "+0" seria inventarse una
              medicion anterior que no existe.
            */}
            {resumen.tipo === 'serie' ? (
              <Text
                style={estilos.cambio}
                accessibilityLabel={lecturaDeCambio(resumen.cambio.delta, medida)}
              >
                {comoCambio(resumen.cambio.delta, medida.unidad)} desde la anterior
              </Text>
            ) : null}

            <Text style={estilos.fecha}>{fechaDeInstante(resumen.ultimo.iso)}</Text>
          </View>
        ) : null}

        {/* La linea, solo con dos puntos o mas. */}
        {resumen.tipo === 'serie' ? (
          <GraficoDeProgreso puntos={resumen.puntos} medida={medida} />
        ) : null}

        {otras.length > 0 ? (
          <View style={estilos.seccion}>
            <Text style={estilos.tituloDeSeccion}>EN LA ÚLTIMA MEDICIÓN</Text>
            {otras.map(({ medida: otra, valor }) => (
              /*
                La fila entera es UN elemento. Por separado se oia
                "Cintura", "Cintura: 79 cm" y "cm": tres anuncios para un
                dato.
              */
              <View
                key={otra.campo}
                style={estilos.filaDeMedida}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${otra.etiqueta}: ${comoNumero(valor)} ${otra.unidad}`}
              >
                <Text
                  style={estilos.nombreDeMedida}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  aria-hidden
                >
                  {otra.etiqueta}
                </Text>
                <Text
                  style={estilos.valorDeMedida}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  aria-hidden
                >
                  {comoNumero(valor)} <Text style={estilos.unidadPequena}>{otra.unidad}</Text>
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/*
          El historial.

          Sin `FlatList`: el servidor no pagina ni limita `/me/progress`, pero
          un gimnasio mide a un socio cada varias semanas —doce o quince veces
          al año— asi que son decenas de filas de texto, no miles. Y una lista
          virtualizada dentro del `ScrollView` de `Pantalla` es el anidamiento
          que rompe la virtualizacion en React Native: se ganaria el aviso sin
          ganar el beneficio.
        */}
        {filas.length > 1 ? (
          <View style={estilos.seccion}>
            <Text style={estilos.tituloDeSeccion}>HISTORIAL</Text>
            {filas.map((fila) => (
              /*
                Fecha primero y medidas despues, en un solo anuncio: el orden
                de lectura es el de la pantalla. El separador visual "·" se
                cambia por comas para el lector, que lo deletrearia.
              */
              <View
                key={fila.id}
                style={estilos.filaDeHistorial}
                accessible
                accessibilityRole="text"
                accessibilityLabel={lecturaDeFila(fila, fechaDeInstante(fila.iso))}
              >
                <Text
                  style={estilos.fechaDeHistorial}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  aria-hidden
                >
                  {fechaDeInstante(fila.iso)}
                </Text>
                <Text
                  style={estilos.medidasDeHistorial}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  aria-hidden
                >
                  {fila.valores
                    .map((v) => `${v.medida.corta} ${comoNumero(v.valor)} ${v.medida.unidad}`)
                    .join(' · ')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <PieDePrivacidad />
      </View>
    </Pantalla>
  );
}

/**
 * La espera.
 *
 * Reserva el rotulo, la cifra y el alto del grafico. NO se dibuja un grafico
 * falso: una linea inventada mientras cargan los datos es, durante medio
 * segundo, un dato de salud que nadie midio.
 */
function Cargando() {
  return (
    <Pantalla titulo="Progreso" descriptor="Tus mediciones">
      <View accessible accessibilityLabel="Cargando tus mediciones" style={estilos.espera}>
        <View style={estilos.huecoRotulo} />
        <View style={estilos.huecoValor} />
        <View style={estilos.huecoCambio} />
        <View style={estilos.huecoGrafico} />
      </View>
    </Pantalla>
  );
}

/**
 * Quién decide si te miden, y dónde se cambia.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ REFERENCIA DISCRETA, NO UNA SEGUNDA PANTALLA LEGAL.                     │
 * │                                                                          │
 * │ Es la misma linea que el panel web pone al pie de su Progreso, y por el │
 * │ mismo motivo: quien se pregunte por que dejaron de tomarle              │
 * │ medidas tiene aqui el camino. La gestion sigue estando en un solo sitio  │
 * │ —Perfil > Privacidad— y aqui no se acepta ni se revoca nada.             │
 * │                                                                          │
 * │ Faltaba, y lo encontro la auditoria de PARITY-5: en el movil Privacidad  │
 * │ vive en la pestaña de Perfil, asi que la capacidad estaba, pero desde    │
 * │ esta pantalla no habia forma de llegar ni nada que lo explicara.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function PieDePrivacidad() {
  return (
    <Pressable
      onPress={() => router.push('/perfil/privacidad')}
      accessibilityRole="link"
      accessibilityLabel="Privacidad: decide si tu gimnasio puede registrar estos datos"
      style={({ pressed }) => [estilos.pie, pressed && estilos.piePulsado]}
    >
      <Text style={estilos.pieTexto}>
        Tú decides si tu gimnasio puede registrar estos datos en{' '}
        <Text style={estilos.pieEnlace}>Privacidad</Text>.
      </Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  // El selector se sale a los bordes; el resto respeta el margen de siempre.
  cuerpo: { paddingHorizontal: tema.espacio.lg, gap: tema.espacio.xl },

  hero: { gap: tema.espacio.xs },
  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    color: tema.color.textoSecundario,
  },
  cifra: { flexDirection: 'row', alignItems: 'baseline', gap: tema.espacio.sm },
  valor: {
    fontSize: 44,
    fontWeight: '700',
    color: tema.color.texto,
    // 56 y no 52: medido, la caja de "71,4" pide 55 y a 52 se recortaba.
    lineHeight: 56,
  },
  unidad: { ...tema.texto.h3, color: tema.color.textoSecundario },
  // Gris, nunca verde ni rojo: el signo es aritmetica, no un juicio.
  cambio: { ...tema.texto.cuerpo, color: tema.color.textoSecundario },
  fecha: { ...tema.texto.meta, color: tema.color.textoSecundario },

  seccion: { gap: tema.espacio.sm },
  tituloDeSeccion: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    color: tema.color.textoSecundario,
  },
  filaDeMedida: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: tema.espacio.sm,
    borderTopWidth: 1,
    borderTopColor: tema.color.borde,
  },
  nombreDeMedida: { ...tema.texto.cuerpo, color: tema.color.textoSecundario },
  valorDeMedida: { ...tema.texto.h3, color: tema.color.texto },
  unidadPequena: { ...tema.texto.secundario, color: tema.color.textoSecundario },

  filaDeHistorial: {
    gap: 2,
    paddingVertical: tema.espacio.sm,
    borderTopWidth: 1,
    borderTopColor: tema.color.borde,
  },
  fechaDeHistorial: { ...tema.texto.secundario, fontWeight: '600', color: tema.color.texto },
  medidasDeHistorial: {
    ...tema.texto.meta,
    color: tema.color.textoSecundario,
    lineHeight: 18,
  },

  pie: { paddingTop: tema.espacio.lg, minHeight: tema.controlAltoMinimo, justifyContent: 'center' },
  piePulsado: { opacity: 0.6 },
  pieTexto: { ...tema.texto.meta, color: tema.color.textoSecundario, lineHeight: 18 },
  pieEnlace: { color: tema.color.acento, fontWeight: '600' },

  vacio: { gap: tema.espacio.sm },
  vacioTitulo: { ...tema.texto.h3, color: tema.color.texto },
  vacioTexto: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },

  espera: { gap: tema.espacio.md },
  huecoRotulo: { width: 72, height: 14, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoValor: { width: 160, height: 48, borderRadius: 6, backgroundColor: tema.color.superficie },
  huecoCambio: { width: 190, height: 18, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoGrafico: {
    height: ALTO_DEL_TRAZO,
    borderRadius: 8,
    backgroundColor: tema.color.superficie,
    marginTop: tema.espacio.md,
  },
});
