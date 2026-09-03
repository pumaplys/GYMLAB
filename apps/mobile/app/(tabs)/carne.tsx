import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  debePedirTrasSegundoPlano,
  estadoDelCodigo,
  haCaducado,
  lecturaDeCuota,
  segundosRestantes,
  textoDeCuentaAtras,
  type EstadoDelPase,
} from '../../src/carne/logica';
import { tema } from '../../src/tema';

/**
 * El carne y su codigo de acceso.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE ABRE CARNE Y YA HAY CODIGO. SIN PULSAR NADA.                         │
 * │                                                                          │
 * │ La primera version tenia un boton "Mostrar mi codigo" que se pulsaba     │
 * │ delante de la puerta. Es una friccion de mas: quien toca "Carne" en la   │
 * │ cola del torno quiere enseñar el telefono, no dar dos pasos.             │
 * │                                                                          │
 * │ Ahora se pide al ENTRAR, y se pide otro CADA VEZ que se entra, aunque el │
 * │ anterior no haya caducado: el codigo es de un solo uso y el cliente no   │
 * │ puede saber si un escaner ya lo consumio. Ver `SE_PIDE_AL_ENTRAR`.       │
 * │                                                                          │
 * │ Lo que NO hay es sondeo: mientras el codigo vive no se pide nada mas. El │
 * │ boton solo aparece cuando caduca o cuando falla.                        │
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

  /** El pase. Solo en memoria. */
  const [pase, setPase] = useState<EstadoDelPase>({ fase: 'pidiendo' });
  const [restan, setRestan] = useState(0);

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

  /**
   * Pide un codigo y sustituye el que hubiera.
   *
   * Si falla, el anterior NO se conserva: un codigo del que ya no sabemos
   * nada es peor que ninguno, porque invita a enseñarlo. Y un fallo de red no
   * cierra la sesion — solo deja el pase en error.
   */
  const generar = useCallback(async () => {
    setPase({ fase: 'pidiendo' });
    try {
      const codigo = await pedirCodigo();
      setPase({ fase: 'listo', codigo });
    } catch (problema) {
      // El mensaje NUNCA lleva el token: `mensajeDeEntrada` produce frases
      // fijas y no reenvia nada del servidor en los 5xx.
      setPase({ fase: 'error', mensaje: mensajeDeEntrada(problema) });
    }
  }, []);

  useEffect(() => {
    if (!gymId) return;
    // Al cambiar de gimnasio se tira el pase ANTES de pedir nada: su firma se
    // deriva del gimnasio, asi que alli no valdria.
    setPase({ fase: 'pidiendo' });
    void cargar();
  }, [gymId, cargar]);

  /*
   * Entrar en la pestaña pide un codigo nuevo. Cada vez.
   *
   * `useFocusEffect` se dispara cuando la pantalla recupera el foco, que es
   * exactamente el gesto que hay que atender.
   */
  useFocusEffect(
    useCallback(() => {
      void generar();
    }, [generar]),
  );

  /*
   * La cuenta atras. Una vez por segundo, no por fotograma.
   *
   * Se RECALCULA contra `expiresAt` en cada tic en lugar de restar uno: asi
   * volver del segundo plano —donde el sistema congela los temporizadores— no
   * deja el numero adelantado. Al llegar a cero el pase pasa a `caducado` y el
   * codigo DESAPARECE: no se deja en gris, porque un QR a la vista invita a
   * enseñarlo y uno caducado no abre.
   */
  useEffect(() => {
    if (pase.fase !== 'listo') return;
    const { expiresAt } = pase.codigo;

    const tic = () => {
      const quedan = segundosRestantes(expiresAt);
      setRestan(quedan);
      if (quedan === 0) setPase({ fase: 'caducado' });
    };

    tic();
    const reloj = setInterval(tic, CADA_CUANTO_MS);
    return () => clearInterval(reloj);
  }, [pase]);

  /*
   * Volver del segundo plano.
   *
   * NO es lo mismo que volver a la pestaña: aqui el codigo que sigue valiendo
   * SE CONSERVA. Ver `debePedirTrasSegundoPlano`. La suscripcion se cancela al
   * desmontar.
   */
  const paseRef = useRef(pase);
  paseRef.current = pase;
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (siguiente) => {
      if (siguiente !== 'active') return;
      if (debePedirTrasSegundoPlano(paseRef.current)) void generar();
    });
    return () => suscripcion.remove();
  }, [generar]);

  /*
   * El lado del codigo.
   *
   * El ancho util es el de la pantalla menos el relleno del marco (16 a cada
   * lado) y el de la tarjeta (16 a cada lado). Se limita a 320 para que en un
   * telefono grande no crezca hasta empujar todo lo demas fuera.
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

  const caducado = pase.fase === 'caducado' || haCaducado(pase);
  const hayCodigo = pase.fase === 'listo' && !caducado;
  const situacion = estadoDelCodigo(hayCodigo && pase.fase === 'listo' ? pase.codigo : null);
  const lectura = lecturaDeCuota(cuota);

  return (
    <Pantalla>
      <Cabecera />

      <Tarjeta>
        {/* 1. El codigo, que es a lo que se viene. */}
        {pase.fase === 'listo' && !caducado ? (
          <CodigoDeAcceso token={pase.codigo.token} lado={lado} />
        ) : (
          <HuecoDelCodigo lado={lado}>
            <Text style={estilos.instruccion}>
              {pase.fase === 'pidiendo'
                ? 'Preparando tu codigo…'
                : pase.fase === 'error'
                  ? pase.mensaje
                  : 'Tu codigo ha caducado.'}
            </Text>
          </HuecoDelCodigo>
        )}

        {/* 2. Cuanto le queda, en palabras. Se anuncia solo al cambiar. */}
        {hayCodigo ? (
          <Text
            style={[estilos.vigencia, situacion === 'porCaducar' && estilos.urgente]}
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
          >
            {textoDeCuentaAtras(restan)}
          </Text>
        ) : null}

        {/*
          3. En que situacion esta la membresia.

          Va AQUI, pegado al codigo, y no al final de la pantalla. Con la cuota
          vencida el aviso quedaba debajo de la tarjeta y la barra inferior lo
          tapaba: quien mas necesitaba leerlo era justo quien no lo veia sin
          desplazar.
        */}
        <View style={estilos.situacion}>
          <Etiqueta tono={lectura.tono}>{lectura.titulo}</Etiqueta>
          {avisaDeQueLaPuertaPuedeNegar(cuota) ? (
            <Text style={estilos.puedeNegar}>
              Es probable que la puerta no te deje pasar hasta que se resuelva.
            </Text>
          ) : null}
        </View>

        {/*
          El boton SOLO existe cuando hace falta: caducado o fallo. Mientras el
          codigo vive no hay nada que pulsar, y esa ausencia es la mitad de la
          mejora — se abre la pantalla y ya esta listo.
        */}
        {caducado || pase.fase === 'error' ? (
          <Boton
            variante="primario"
            onPress={() => void generar()}
            accessibilityHint="Pide un codigo de acceso nuevo"
          >
            {pase.fase === 'error' ? 'Reintentar' : 'Generar nuevo codigo'}
          </Boton>
        ) : null}

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
        La explicacion, fuera de la tarjeta: amplia lo que ya dice la pastilla y
        no compite con el codigo.
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
