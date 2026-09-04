import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { Icono } from '../../src/componentes/icono';
import { Pantalla } from '../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { cargarFicha } from '../../src/perfil/fuente';
import { identidadDe, type EstadoDeCarga } from '../../src/perfil/logica';
import type { NombreDeIcono } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';
import type { Member } from '@gymlab/contracts';

/**
 * Perfil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES EL CENTRO DE LA CUENTA, NO UN FORMULARIO APAGADO.                    │
 * │                                                                          │
 * │ El perfil NO se edita, y no porque se haya decidido esconderlo: la API   │
 * │ no tiene endpoint para cambiar la ficha de uno mismo. Un formulario con  │
 * │ los campos en gris prometeria algo que no existe, asi que los datos se   │
 * │ presentan como lo que son — quien eres y en que gimnasio.                │
 * │                                                                          │
 * │ Tampoco hay foto, ni contraseña, ni notificaciones, ni preferencias, ni  │
 * │ biometria, ni borrar la cuenta. Ninguna tiene endpoint.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IDENTIDAD ARRIBA, TRES FILAS, Y SALIR AL FINAL.                         │
 * │                                                                          │
 * │ Sin hero lima: ya lo tiene Inicio, y aqui no hay una accion que domine.  │
 * │ Sin cinco tarjetas iguales, que es en lo que se convierten los ajustes   │
 * │ de casi cualquier app. Filas con una linea de 1 px, como en Rutina.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Perfil() {
  const { estado: sesion, revisar, salir } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga<Member>>({ fase: 'cargando' });
  const [saliendo, setSaliendo] = useState(false);

  const gimnasio =
    sesion.tipo === 'autenticado'
      ? sesion.yo.memberships.find((m) => m.gymId === sesion.gymId)?.gymName
      : undefined;

  const cargar = useCallback(async () => {
    try {
      setCarga({ fase: 'ok', datos: await cargarFicha() });
    } catch (problema) {
      // La MISMA politica que Inicio, Rutina y Progreso.
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo', mensaje: 'No pudimos cargar tu perfil.' });
    }
  }, [revisar]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ SALIR NO SE REIMPLEMENTA AQUI.                                        │
   * │                                                                        │
   * │ `salir()` del proveedor avisa al servidor, y borre o no el servidor su │
   * │ sesion, el token local se va SIEMPRE: si no hay red, el telefono tiene │
   * │ que poder cerrarse igual. Esta pantalla no toca SecureStore ni navega  │
   * │ a mano — al pasar a `sinSesion`, el guardia de `(tabs)` hace el resto. │
   * │                                                                        │
   * │ Por eso da igual que la sesion ya estuviera caducada: el 401 del       │
   * │ logout se traga, se borra el token y se sale. No hay estado imposible. │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const cerrarSesion = useCallback(() => {
    setSaliendo(true);
    void salir().finally(() => setSaliendo(false));
  }, [salir]);

  const ficha = carga.fase === 'ok' ? carga.datos : null;
  const identidad = ficha ? identidadDe(ficha) : null;

  return (
    <Pantalla titulo="Perfil" descriptor="Tu cuenta">
      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">{carga.mensaje}</Aviso>
          <Boton variante="primario" onPress={() => void cargar()}>
            Reintentar
          </Boton>
        </>
      ) : null}

      {/*
        La identidad. Con la ficha cargada son tres lineas reales; mientras
        llega se reserva su sitio para que las filas no salten.
      */}
      <View style={estilos.identidad}>
        <View style={estilos.circulo}>
          <Text style={estilos.inicial} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
            {identidad?.inicial ?? ' '}
          </Text>
        </View>
        <View style={estilos.datos}>
          {identidad ? (
            <>
              <Text style={estilos.nombre} accessibilityRole="header">
                {identidad.nombre}
              </Text>
              <Text style={estilos.meta}>
                {[identidad.numero, gimnasio].filter(Boolean).join(' · ')}
              </Text>
            </>
          ) : (
            <>
              <View style={estilos.huecoNombre} />
              <View style={estilos.huecoMeta} />
            </>
          )}
        </View>
      </View>

      {/*
        Las tres secciones. Fuera del grupo de pestañas: se apilan encima, no
        se convierten en una sexta pestaña. Ver `app/perfil/`.
      */}
      <View style={estilos.secciones}>
        <FilaDePerfil
          icono="pagos"
          titulo="Pagos"
          detalle="Lo que has pagado y cuándo"
          a="/perfil/pagos"
          primera
        />
        <FilaDePerfil
          icono="accesos"
          titulo="Accesos"
          detalle="Tus entradas al gimnasio"
          a="/perfil/accesos"
        />
        <FilaDePerfil
          icono="privacidad"
          titulo="Privacidad"
          detalle="Tus datos de salud"
          a="/perfil/privacidad"
        />
      </View>

      {/* Un hueco flexible: salir se queda abajo, lejos de lo que se pulsa. */}
      <View style={estilos.hueco} />

      <Boton onPress={cerrarSesion} cargando={saliendo}>
        Cerrar sesión
      </Boton>
    </Pantalla>
  );
}

/** Una sección de Perfil: icono, nombre, una linea de que hay dentro. */
function FilaDePerfil({
  icono,
  titulo,
  detalle,
  a,
  primera = false,
}: {
  icono: NombreDeIcono;
  titulo: string;
  detalle: string;
  a: '/perfil/pagos' | '/perfil/accesos' | '/perfil/privacidad';
  primera?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push(a)}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityHint={detalle}
      style={({ pressed }) => [estilos.fila, primera && estilos.filaPrimera, pressed && estilos.filaPulsada]}
    >
      <Icono nombre={icono} color={tema.color.textoSecundario} tamano={22} />
      <View style={estilos.textoDeFila}>
        <Text style={estilos.tituloDeFila}>{titulo}</Text>
        <Text style={estilos.detalleDeFila}>{detalle}</Text>
      </View>
      <Icono nombre="avanzar" color={tema.color.textoSecundario} tamano={18} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  identidad: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.lg },
  /*
   * La inicial, no un avatar.
   *
   * El producto no tiene foto de socio: ni columna, ni endpoint, ni la ficha
   * de recepcion la pide. Una silueta generica seria un hueco disfrazado, y
   * una foto inventada seria mentira. La letra es lo unico real que hay.
   */
  circulo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tema.color.superficie,
    borderWidth: 1,
    borderColor: tema.color.borde,
  },
  inicial: { ...tema.texto.h2, color: tema.color.acento },
  datos: { flex: 1, gap: tema.espacio.xs },
  nombre: { ...tema.texto.h2, color: tema.color.texto },
  meta: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  huecoNombre: { width: '65%', height: 22, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoMeta: { width: '85%', height: 16, borderRadius: 4, backgroundColor: tema.color.superficie },

  secciones: { marginTop: tema.espacio.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacio.lg,
    minHeight: tema.controlAltoMinimo,
    paddingVertical: tema.espacio.md,
    borderTopWidth: 1,
    borderTopColor: tema.color.borde,
  },
  filaPrimera: { borderTopWidth: 0 },
  filaPulsada: { opacity: 0.6 },
  textoDeFila: { flex: 1, gap: 2 },
  tituloDeFila: { ...tema.texto.cuerpo, fontWeight: '600', color: tema.color.texto },
  detalleDeFila: { ...tema.texto.meta, color: tema.color.textoSecundario },

  hueco: { flex: 1, minHeight: tema.espacio.xl },
});
