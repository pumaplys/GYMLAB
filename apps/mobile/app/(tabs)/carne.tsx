import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { DuesStatus, Member } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { CodigoDeAcceso, HuecoDelCodigo } from '../../src/componentes/codigo-de-acceso';
import { Etiqueta } from '../../src/componentes/etiqueta';
import { Pantalla } from '../../src/componentes/pantalla';
import { Tarjeta } from '../../src/componentes/tarjeta';
import { useSesion } from '../../src/auth/sesion';
import { cargarCarne, pedirCodigo } from '../../src/carne/fuente';
import { mensajeDeEntrada } from '../../src/auth/mensajes';
import {
  CADA_CUANTO_MS,
  avisaDeQueLaPuertaPuedeNegar,
  debeDescartarse,
  estadoDelCodigo,
  lecturaDeCuota,
  segundosRestantes,
  textoDeCuentaAtras,
  type CodigoDeAcceso as Codigo,
} from '../../src/carne/logica';
import { tema } from '../../src/tema';

/**
 * El carne y su codigo de acceso.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL CODIGO NO SE GENERA AL ENTRAR, Y NO ES UNA PREFERENCIA.              │
 * │                                                                          │
 * │ Dura SESENTA SEGUNDOS —medido contra el fixture— y se consume al         │
 * │ escanearlo. Generarlo al abrir la pestaña significaria que, para cuando  │
 * │ alguien llega al torno, ya esta caducado; y ademas gastaria un token     │
 * │ cada vez que se toca "Carne" sin intencion de entrar.                    │
 * │                                                                          │
 * │ Asi que hay un boton, y se pulsa delante de la puerta. Es lo mismo que   │
 * │ hace el panel web, por la misma razon.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL TOKEN VIVE EN MEMORIA Y EN NINGUN SITIO MAS.                         │
 * │                                                                          │
 * │ No va a SecureStore. El Bearer de sesion y este codigo son cosas         │
 * │ distintas: el primero es quien eres y dura; el segundo es una llave de   │
 * │ un solo uso que caduca en un minuto. Guardar una llave que sobrevive al  │
 * │ cierre de la app es guardar una llave perdida — y ademas no serviria,    │
 * │ porque para cuando se recuperase estaria caducada.                       │
 * │                                                                          │
 * │ Tampoco se escribe en ningun registro ni se enseña como texto.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Carne() {
  const { estado: sesion } = useSesion();
  const { width } = useWindowDimensions();

  const [ficha, setFicha] = useState<Member | null>(null);
  const [cuota, setCuota] = useState<DuesStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** El codigo vigente. Solo en memoria. */
  const [codigo, setCodigo] = useState<Codigo | null>(null);
  const [restan, setRestan] = useState(0);
  const [generando, setGenerando] = useState(false);
  const [errorAlGenerar, setErrorAlGenerar] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const gimnasio =
    sesion.tipo === 'autenticado'
      ? sesion.yo.memberships.find((m) => m.gymId === sesion.gymId)?.gymName
      : undefined;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { ficha: mia, cuota: suCuota } = await cargarCarne();
      setFicha(mia);
      setCuota(suCuota);
    } catch (problema) {
      setError(mensajeDeEntrada(problema));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!gymId) return;
    // Al cambiar de gimnasio se tira el codigo ANTES de pedir nada: su firma se
    // deriva del gimnasio, asi que alli no valdria — y lo que no puede pasar es
    // que se quede a la vista como si sirviera.
    setCodigo(null);
    setErrorAlGenerar(null);
    void cargar();
  }, [gymId, cargar]);

  /*
   * La cuenta atras. Una vez por segundo, no por fotograma.
   *
   * Se RECALCULA contra `expiresAt` en cada tic en lugar de restar uno: asi
   * volver del segundo plano —donde el sistema congela los temporizadores— no
   * deja el numero adelantado. Y se limpia al desmontar y cada vez que cambia
   * el codigo, que es lo que evita dejar un intervalo corriendo por cada
   * codigo generado.
   */
  useEffect(() => {
    if (!codigo) return;
    setRestan(segundosRestantes(codigo.expiresAt));
    const reloj = setInterval(() => setRestan(segundosRestantes(codigo.expiresAt)), CADA_CUANTO_MS);
    return () => clearInterval(reloj);
  }, [codigo]);

  /*
   * Al volver a la pestaña, un codigo caducado se tira.
   *
   * No se genera uno nuevo: eso gastaria un token por cada vez que alguien
   * pasa por aqui. Solo se retira lo que ya no sirve para que no siga en
   * pantalla aparentando que si.
   */
  const codigoRef = useRef(codigo);
  codigoRef.current = codigo;
  useFocusEffect(
    useCallback(() => {
      if (debeDescartarse(codigoRef.current)) setCodigo(null);
    }, []),
  );

  const generar = useCallback(async () => {
    if (generando) return;
    setGenerando(true);
    setErrorAlGenerar(null);
    try {
      setCodigo(await pedirCodigo());
    } catch (problema) {
      // El mensaje NUNCA lleva el token: `mensajeDeEntrada` solo produce frases
      // fijas y no reenvia nada del servidor en los 5xx.
      setErrorAlGenerar(mensajeDeEntrada(problema));
    } finally {
      setGenerando(false);
    }
  }, [generando]);

  /*
   * El lado del codigo.
   *
   * El ancho util es el de la pantalla menos el relleno del marco (16 a cada
   * lado) y el de la tarjeta (16 a cada lado). Se limita a 320 para que en un
   * telefono grande no crezca hasta empujar todo lo demas fuera: por encima de
   * ese tamaño ya se lee de sobra y lo unico que se gana es scroll.
   */
  const lado = Math.min(width - tema.espacio.lg * 4, 320);

  if (cargando) {
    return (
      <Pantalla>
        <Cabecera />
        <Tarjeta>
          <HuecoDelCodigo lado={lado}>
            <Text style={estilos.instruccion}>Cargando tu carne…</Text>
          </HuecoDelCodigo>
        </Tarjeta>
      </Pantalla>
    );
  }

  if (error || !ficha || !cuota) {
    return (
      <Pantalla>
        <Cabecera />
        <Aviso tono="peligro">{error ?? 'No pudimos cargar tu carne.'}</Aviso>
        <Boton variante="primario" onPress={() => void cargar()}>
          Reintentar
        </Boton>
      </Pantalla>
    );
  }

  const situacion = estadoDelCodigo(codigo, Date.now());
  const caducado = situacion === 'caducado';
  const lectura = lecturaDeCuota(cuota);

  return (
    <Pantalla>
      <Cabecera />

      <Tarjeta>
        {/* 1. El codigo, que es a lo que se viene. */}
        {codigo && !caducado ? (
          <CodigoDeAcceso token={codigo.token} lado={lado} />
        ) : (
          <HuecoDelCodigo lado={lado}>
            <Text style={estilos.instruccion}>
              {caducado
                ? 'Tu codigo ha caducado.'
                : 'Genera tu codigo cuando estes en la puerta: vale un minuto y se usa una vez.'}
            </Text>
          </HuecoDelCodigo>
        )}

        {/* 2. Cuanto le queda, en palabras. Se anuncia solo al cambiar. */}
        {codigo ? (
          <Text
            style={[estilos.vigencia, (caducado || situacion === 'porCaducar') && estilos.urgente]}
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
          >
            {textoDeCuentaAtras(restan)}
          </Text>
        ) : null}

        {/*
          2. En que situacion esta la membresia.

          Va AQUI, pegado al codigo, y no al final de la pantalla. Con la
          cuota vencida el aviso quedaba debajo de la tarjeta y la barra
          inferior lo tapaba: quien mas necesitaba leerlo era justo quien no
          lo veia sin desplazar.
        */}
        <View style={estilos.situacion}>
          <Etiqueta tono={lectura.tono}>{lectura.titulo}</Etiqueta>
          {avisaDeQueLaPuertaPuedeNegar(cuota) ? (
            <Text style={estilos.puedeNegar}>
              Es probable que la puerta no te deje pasar hasta que se resuelva.
            </Text>
          ) : null}
        </View>

        <Boton
          variante={codigo && !caducado ? 'secundario' : 'primario'}
          onPress={() => void generar()}
          cargando={generando}
          accessibilityHint="Pide un codigo de acceso nuevo"
        >
          {codigo ? 'Generar otro codigo' : 'Mostrar mi codigo'}
        </Boton>

        {errorAlGenerar ? <Aviso tono="peligro">{errorAlGenerar}</Aviso> : null}

        {/* 4, 5 y 6. Quien soy, donde y con que numero. */}
        <View style={estilos.separador} />
        <View style={estilos.identidad}>
          <Text style={estilos.nombre}>
            {ficha.firstName} {ficha.lastName}
          </Text>
          {gimnasio ? <Text style={estilos.gimnasio}>{gimnasio}</Text> : null}
          <View style={estilos.numeroBloque}>
            <Text style={estilos.meta}>N.º DE SOCIO</Text>
            <Text style={estilos.numero}>{ficha.memberNumber}</Text>
          </View>
        </View>
      </Tarjeta>

      {/*
        La explicacion, fuera de la tarjeta: amplia lo que ya dice la pastilla
        y no compite con el codigo. Si alguien no llega a leerla, no se pierde
        nada que no estuviera arriba en una palabra.
      */}
      <Text style={estilos.explicacion}>{lectura.explicacion}</Text>
    </Pantalla>
  );
}

/**
 * La cabecera, contenida a proposito.
 *
 * Un titulo de 26 px diciendo "Carne" encima de un carne le roba sitio al
 * codigo y no informa de nada: la tarjeta que hay debajo ya dice lo que es.
 */
function Cabecera() {
  return (
    <View style={estilos.cabecera}>
      <Text style={estilos.rotulo} accessibilityRole="header">
        CARNE
      </Text>
      <Text style={estilos.descriptor}>Tu acceso al gimnasio</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cabecera: { gap: tema.espacio.xs },
  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: tema.color.textoSecundario,
  },
  descriptor: { ...tema.texto.h3, color: tema.color.texto },

  instruccion: {
    ...tema.texto.secundario,
    color: tema.color.textoSecundario,
    textAlign: 'center',
    lineHeight: 20,
  },
  vigencia: { ...tema.texto.secundario, color: tema.color.textoSecundario, textAlign: 'center' },
  urgente: { color: tema.color.aviso, fontWeight: '600' },

  separador: { height: 1, backgroundColor: tema.color.borde },
  identidad: { gap: tema.espacio.xs },
  nombre: { ...tema.texto.h2, color: tema.color.texto },
  gimnasio: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  numeroBloque: { marginTop: tema.espacio.md, gap: 2 },
  meta: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    color: tema.color.textoSecundario,
  },
  numero: { ...tema.texto.dato, color: tema.color.acento },

  situacion: { gap: tema.espacio.sm, alignItems: 'flex-start' },
  puedeNegar: { ...tema.texto.secundario, color: tema.color.aviso, lineHeight: 20 },
  explicacion: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },
});
