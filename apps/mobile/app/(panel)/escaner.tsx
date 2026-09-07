import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useIsFocused } from 'expo-router';
import type { AccessResult } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { Icono } from '../../src/componentes/icono';
import { useSesion } from '../../src/auth/sesion';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { destinoAlSalirDelEscaner } from '../../src/navegacion/destinos';
import { Visor, usarPermisoDeCamara } from '../../src/escaner/camara';
import { verificarCarne } from '../../src/escaner/fuente';
import {
  MENSAJE_DEL_MOTIVO,
  TITULO_DE_LA_DECISION,
  detalleDeCuota,
  nombreDelSocio,
  tonoDeLaDecision,
} from '../../src/escaner/logica';
import { puedePedirse } from '../../src/escaner/permiso';
import {
  ESTADO_INICIAL,
  camaraActiva,
  debeEnviar,
  siguiente,
  type EstadoDelEscaner,
} from '../../src/escaner/maquina';
import { tema } from '../../src/tema';

/**
 * El escaner de la puerta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE DECIDE NADA. NI QUIEN PASA, NI SI UN CODIGO YA SE USO.       │
 * │                                                                          │
 * │ Esta pantalla lee un QR, lo manda, y cuenta lo que contesto el servidor. │
 * │ Todo lo demas —la cuota, el uso unico del `jti`, la ventana de reintento │
 * │ y el `isRetry`— vive en la API y no se replica ni se interpreta.         │
 * │                                                                          │
 * │ El veredicto se pinta a partir de `decision`, NUNCA de `reason`: deducir │
 * │ el color del motivo abriria la puerta a pintar verde sobre un DENY.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL TOKEN NO SE GUARDA, NO SE ESCRIBE Y NO SE ENSEÑA.                    │
 * │                                                                          │
 * │ Vive en la maquina de estados mientras dura el escaneo —hace falta para  │
 * │ no reenviar el mismo dos veces— y muere con la pantalla. No va a         │
 * │ SecureStore, no aparece en ningun `console`, y no se pinta ni recortado. │
 * │ Es la llave de otra persona: no es nuestra para conservarla.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Escaner() {
  const { estado: sesion, revisar } = useSesion();
  const permiso = usarPermisoDeCamara();
  const [estado, despachar] = useReducer(siguiente, ESTADO_INICIAL);
  const enfocada = useIsFocused();
  const [appActiva, setAppActiva] = useState(AppState.currentState === 'active');

  /*
   * El estado en una ref ADEMAS del reducer: `onBarcodeScanned` se dispara
   * muchas veces por fotograma y la callback que tiene montada la camara puede
   * ser de un render anterior. Preguntandole al reducer a traves de la ref se
   * mira SIEMPRE lo ultimo, y no lo que habia cuando se monto el visor.
   */
  const actual = useRef<EstadoDelEscaner>(estado);
  actual.current = estado;

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA CAMARA SE PARA CUANDO LA PANTALLA NO ESTA DELANTE.                │
   * │                                                                      │
   * │ Dos cosas distintas y las dos hacen falta: `useIsFocused` cubre       │
   * │ navegar a otra pantalla dentro de la app, y `AppState` cubre irse a   │
   * │ otra aplicacion o bloquear el telefono. Con solo la primera, el       │
   * │ escaner seguiria mirando con el telefono en el bolsillo.              │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActiva(s === 'active'));
    return () => sub.remove();
  }, []);

  const alLeer = useCallback(
    (texto: string) => {
      // La misma pregunta que hara el reducer. Se hace antes para no lanzar
      // una peticion que despues se ignoraria.
      if (!gymId || !debeEnviar(texto, actual.current)) return;
      const token = texto.trim();
      despachar({ tipo: 'leido', texto: token });

      void (async () => {
        try {
          despachar({ tipo: 'respondio', resultado: await verificarCarne(gymId, token) });
        } catch (fallo) {
          /*
           * Un 401 aqui NO es un fallo del escaner: es la sesion entera. Se
           * pregunta a la MISMA politica que el resto de la app —ni se
           * clasifica el error a mano, ni se borra el token, ni se navega al
           * login— y se deja que `revisar()` decida volviendo a preguntar al
           * servidor.
           */
          if (laSesionYaNoVale([fallo])) {
            void revisar();
            return;
          }
          despachar({
            tipo: 'fallo',
            mensaje: 'No se ha podido comprobar el carné. Revisa la conexión y vuelve a intentarlo.',
          });
        }
      })();
    },
    [gymId, revisar],
  );

  const salir = () => {
    if (destinoAlSalirDelEscaner(router.canGoBack()) === 'atras') router.back();
    else router.replace('/panel');
  };

  const enPrimerPlano = enfocada && appActiva;
  const activa = permiso.estado === 'concedido' && camaraActiva(estado, enPrimerPlano);

  return (
    <View style={estilos.raiz}>
      {permiso.estado === 'concedido' ? <Visor activa={activa} alLeer={alLeer} /> : null}

      <SafeAreaView style={estilos.capa} edges={['top', 'bottom', 'left', 'right']}>
        <View style={estilos.barraSuperior}>
          <Pressable
            onPress={salir}
            accessibilityRole="button"
            accessibilityLabel="Volver al Panel"
            style={({ pressed }) => [estilos.volver, pressed && estilos.volverPulsado]}
          >
            <Icono nombre="volver" color={tema.color.texto} tamano={20} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Escanear carné
          </Text>
        </View>

        {permiso.estado !== 'concedido' ? (
          <PermisoPendiente estado={permiso.estado} pedir={permiso.pedir} />
        ) : estado.fase.tipo === 'resultado' || estado.fase.tipo === 'fallo' ? (
          /*
           * Con un veredicto delante, el marco de punteria SE QUITA. Ya no hay
           * nada a lo que apuntar, y dejarlo compite con lo unico que hay que
           * leer en ese momento — que ademas es lo que decide si alguien entra.
           */
          <View style={estilos.centro} />
        ) : (
          <Guia fase={estado.fase.tipo} />
        )}

        <View style={estilos.pie}>
          {estado.fase.tipo === 'resultado' ? (
            <Veredicto
              resultado={estado.fase.resultado}
              alCerrar={() => despachar({ tipo: 'cerrar' })}
            />
          ) : null}

          {estado.fase.tipo === 'fallo' ? (
            <View style={estilos.bloque}>
              <Aviso tono="peligro">{estado.fase.mensaje}</Aviso>
              <Boton variante="primario" onPress={() => despachar({ tipo: 'cerrar' })}>
                Volver a escanear
              </Boton>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * El marco de puntería y el estado del escaneo.
 *
 * Cuatro esquinas y nada mas: un recuadro entero taparia el codigo, y un
 * marco que se ilumina al leer añadiria una animacion que compite con lo unico
 * que hay que mirar despues, que es el veredicto.
 */
function Guia({ fase }: { fase: 'leyendo' | 'verificando' | 'resultado' | 'fallo' }) {
  return (
    <View style={estilos.centro} pointerEvents="none">
      <View style={estilos.marco}>
        <View style={[estilos.esquina, estilos.arribaIzq]} />
        <View style={[estilos.esquina, estilos.arribaDer]} />
        <View style={[estilos.esquina, estilos.abajoIzq]} />
        <View style={[estilos.esquina, estilos.abajoDer]} />
      </View>
      <Text style={estilos.pista} accessibilityLiveRegion="polite">
        {fase === 'verificando'
          ? 'Comprobando…'
          : fase === 'leyendo'
            ? 'Apunta al código del carné del socio.'
            : ''}
      </Text>
    </View>
  );
}

/**
 * Lo que se enseña sin permiso de cámara.
 *
 * La app NO se queda bloqueada: la barra de arriba sigue ahí y se puede volver
 * al Panel. Perder el escaner por un permiso es un contratiempo; quedarse
 * atrapado en una pantalla negra es un fallo.
 */
function PermisoPendiente({
  estado,
  pedir,
}: {
  estado: 'consultando' | 'denegado' | 'bloqueado';
  pedir: () => void;
}) {
  if (estado === 'consultando') {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.pista}>Comprobando el permiso de la cámara…</Text>
      </View>
    );
  }

  return (
    <View style={estilos.centro}>
      <View style={estilos.bloqueAncho}>
        <Aviso tono="aviso">
          {estado === 'bloqueado'
            ? 'RINDA no tiene permiso para usar la cámara y el sistema ya no volverá a preguntarlo. Actívalo en los ajustes del teléfono, en la ficha de RINDA.'
            : 'Para leer carnés hace falta permiso para usar la cámara.'}
        </Aviso>
        {puedePedirse(estado) ? (
          <Boton variante="primario" onPress={pedir}>
            Permitir la cámara
          </Boton>
        ) : null}
      </View>
    </View>
  );
}

/**
 * El veredicto, en grande.
 *
 * Quien está en la puerta lo lee de reojo con una persona delante: la decisión
 * va primero y en cuerpo grande, y el nombre y el número existen para confirmar
 * de un vistazo que quien entra es quien dice el carné.
 */
function Veredicto({
  resultado,
  alCerrar,
}: {
  resultado: AccessResult;
  alCerrar: () => void;
}) {
  const tono = tonoDeLaDecision(resultado.decision);
  const nombre = nombreDelSocio(resultado);
  const detalle = detalleDeCuota(resultado);

  return (
    <View style={[estilos.veredicto, veredictos[tono]]} accessibilityLiveRegion="assertive">
      <Text style={[estilos.decision, decisiones[tono]]} accessibilityRole="header">
        {TITULO_DE_LA_DECISION[resultado.decision]}
      </Text>

      {nombre ? (
        <Text style={estilos.socio}>
          {nombre} <Text style={estilos.numero}>nº {resultado.member?.memberNumber}</Text>
        </Text>
      ) : (
        // Sin socio identificado se dice asi, en vez de dejar un hueco que
        // parezca un fallo de carga.
        <Text style={estilos.sinSocio}>El código no identifica a ningún socio.</Text>
      )}

      <Text style={estilos.motivo}>
        {MENSAJE_DEL_MOTIVO[resultado.reason]}
        {detalle ? ` ${detalle}` : ''}
      </Text>

      {resultado.isRetry ? (
        <Text style={estilos.reintento}>
          Es una relectura del mismo código, no una entrada nueva.
        </Text>
      ) : null}

      {/*
        Secundario, NO lima. El boton lima es lo mas llamativo del sistema y
        aqui competiria con el veredicto: en un «NO PASA» la vista se iria al
        boton en vez de a la palabra que decide si alguien entra. La accion
        sigue siendo la unica de la tarjeta, asi que no se pierde nada.
      */}
      <Boton onPress={alCerrar}>Escanear otro</Boton>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: tema.color.fondo },
  // Sobre el visor. Sin fondo: lo que hay debajo es la camara.
  capa: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'space-between',
  },

  barraSuperior: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacio.md,
    paddingHorizontal: tema.espacio.lg,
    paddingVertical: tema.espacio.md,
  },
  volver: {
    width: tema.controlAltoMinimo,
    height: tema.controlAltoMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tema.radio.pastilla,
    // Un disco oscuro para que la flecha se lea sobre cualquier imagen.
    backgroundColor: 'rgba(13,15,18,0.66)',
  },
  volverPulsado: { backgroundColor: 'rgba(13,15,18,0.9)' },
  titulo: { ...tema.texto.h3, color: tema.color.texto },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tema.espacio.xl },
  bloque: { gap: tema.espacio.md },
  bloqueAncho: { gap: tema.espacio.md, alignSelf: 'stretch', paddingHorizontal: tema.espacio.lg },

  marco: { width: 244, height: 244 },
  esquina: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: tema.color.acento,
  },
  arribaIzq: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  arribaDer: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  abajoIzq: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  abajoDer: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  pista: {
    ...tema.texto.secundario,
    color: tema.color.texto,
    textAlign: 'center',
    paddingHorizontal: tema.espacio.xl,
  },

  pie: { paddingHorizontal: tema.espacio.lg, paddingBottom: tema.espacio.lg, gap: tema.espacio.md },

  veredicto: {
    borderRadius: tema.radio.tarjeta,
    borderWidth: 1,
    padding: tema.espacio.xl,
    gap: tema.espacio.sm,
    backgroundColor: tema.color.superficie,
  },
  decision: { ...tema.texto.display, letterSpacing: 0.5 },
  socio: { ...tema.texto.h3, color: tema.color.texto },
  numero: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  sinSocio: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  motivo: { ...tema.texto.cuerpo, color: tema.color.texto, lineHeight: 24 },
  reintento: { ...tema.texto.meta, color: tema.color.textoSecundario },
});

/** El tinte del bloque sale del TONO, que sale de `decision`. */
const veredictos = StyleSheet.create({
  exito: { borderColor: tema.tinte.borde('exito'), backgroundColor: tema.tinte.fondo('exito') },
  aviso: { borderColor: tema.tinte.borde('aviso'), backgroundColor: tema.tinte.fondo('aviso') },
  peligro: {
    borderColor: tema.tinte.borde('peligro'),
    backgroundColor: tema.tinte.fondo('peligro'),
  },
});

const decisiones = StyleSheet.create({
  exito: { color: tema.color.exito },
  aviso: { color: tema.color.aviso },
  peligro: { color: tema.color.peligro },
});
