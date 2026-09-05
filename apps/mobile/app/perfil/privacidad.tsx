import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { HealthConsentStatus } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { CabeceraDeSubpantalla } from '../../src/componentes/cabecera-de-subpantalla';
import { Etiqueta } from '../../src/componentes/etiqueta';
import { Pantalla } from '../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { fechaDeInstante } from '../../src/formato/fecha';
import { aceptarPrivacidad, cargarPrivacidad, retirarPrivacidad } from '../../src/perfil/fuente';
import {
  accionesDePrivacidad,
  situacionDePrivacidad,
  type EstadoDeCarga,
} from '../../src/perfil/logica';
import { tema } from '../../src/tema';

/**
 * Privacidad: mis datos de salud.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI SI HAY ACCIONES, Y SON LAS QUE LA API TIENE. NI UNA MAS.           │
 * │                                                                          │
 * │ `/me/health-consent` ofrece GET, POST —aceptar la version vigente— y     │
 * │ DELETE —retirarlo—. Esas dos, y ninguna otra: no hay borrar la cuenta,   │
 * │ ni descargar los datos, ni un interruptor por dato.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN TEXTO NO SE OFRECE ACEPTAR.                                         │
 * │                                                                          │
 * │ Un consentimiento del articulo 9 tiene que ser INFORMADO: aceptar algo   │
 * │ que no se puede leer no es consentimiento, es un clic. Por eso el        │
 * │ contrato manda el documento entero —titulo, texto y responsable— y no    │
 * │ solo el numero de version.                                               │
 * │                                                                          │
 * │ Si el gimnasio no ha publicado ninguno, no hay boton: el servidor lo     │
 * │ rechazaria igual. Es el estado del fixture de desarrollo.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Retirar NO borra lo ya recogido, y se dice: las mediciones se conservan
 * porque el gimnasio tiene que poder atender una peticion de acceso o de
 * supresion. Lo que para es que se registren nuevas.
 */
export default function Privacidad() {
  const { revisar } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga<HealthConsentStatus>>({ fase: 'cargando' });
  const [refrescando, setRefrescando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [errorDeAccion, setErrorDeAccion] = useState<string | null>(null);
  const [confirmandoRetirada, setConfirmandoRetirada] = useState(false);

  const pedir = useCallback(async () => {
    try {
      setCarga({ fase: 'ok', datos: await cargarPrivacidad() });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo', mensaje: 'No pudimos cargar tus preferencias de privacidad.' });
    }
  }, [revisar]);

  useFocusEffect(
    useCallback(() => {
      void pedir();
    }, [pedir]),
  );

  const refrescar = useCallback(() => {
    setRefrescando(true);
    void pedir().finally(() => setRefrescando(false));
  }, [pedir]);

  /**
   * Las dos acciones.
   *
   * El servidor devuelve el ESTADO RESULTANTE, asi que no se vuelve a pedir
   * ni se deduce: se pinta lo que responde. Y el error es local —un aviso
   * junto al boton— porque la pantalla sigue siendo legible sin el.
   */
  const ejecutar = useCallback(
    async (accion: () => Promise<HealthConsentStatus>, siFalla: string) => {
      setTrabajando(true);
      setErrorDeAccion(null);
      try {
        setCarga({ fase: 'ok', datos: await accion() });
        setConfirmandoRetirada(false);
      } catch (problema) {
        if (laSesionYaNoVale([problema])) {
          void revisar();
          return;
        }
        setErrorDeAccion(siFalla);
      } finally {
        setTrabajando(false);
      }
    },
    [revisar],
  );

  const situacion = carga.fase === 'ok' ? situacionDePrivacidad(carga.datos) : null;
  const acciones = situacion ? accionesDePrivacidad(situacion) : null;

  return (
    <Pantalla alRefrescar={carga.fase === 'ok' ? refrescar : undefined} refrescando={refrescando}>
      <CabeceraDeSubpantalla titulo="Privacidad" descriptor="Tus datos de salud" />

      {carga.fase === 'cargando' ? (
        <View accessible accessibilityLabel="Cargando tus preferencias de privacidad" style={estilos.espera}>
          <View style={estilos.huecoEtiqueta} />
          <View style={estilos.huecoTitulo} />
          <View style={estilos.huecoTexto} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">{carga.mensaje}</Aviso>
          <Boton variante="primario" onPress={() => void pedir()}>
            Reintentar
          </Boton>
        </>
      ) : null}

      {situacion?.tipo === 'sinTexto' ? (
        <View style={estilos.bloque}>
          <Text style={estilos.encabezado}>Tu gimnasio no ha publicado todavía su texto de privacidad.</Text>
          <Text style={estilos.parrafo}>
            Mientras no exista, no se te puede pedir permiso para registrar tu peso ni tus medidas.
          </Text>
        </View>
      ) : null}

      {situacion && situacion.tipo !== 'sinTexto' ? (
        <View style={estilos.bloque}>
          {/* El estado, en palabras antes que en color. */}
          <Etiqueta tono={situacion.tipo === 'vigente' ? 'exito' : 'aviso'}>
            {situacion.tipo === 'vigente' ? 'Has dado tu permiso' : 'Pendiente de tu permiso'}
          </Etiqueta>

          {situacion.tipo === 'vigente' && situacion.aceptadoEn ? (
            <Text style={estilos.meta}>{`Lo aceptaste el ${fechaDeInstante(situacion.aceptadoEn)}`}</Text>
          ) : null}

          <Text style={estilos.encabezado} accessibilityRole="header">
            {situacion.titulo}
          </Text>
          <Text style={estilos.parrafo}>{situacion.texto}</Text>

          <Text style={estilos.responsable}>{`Responsable: ${situacion.responsable}`}</Text>
          <Text style={estilos.version}>{`Versión ${situacion.version}`}</Text>

          {errorDeAccion ? <Aviso tono="peligro">{errorDeAccion}</Aviso> : null}

          {acciones?.puedeAceptar ? (
            <Boton
              variante="primario"
              cargando={trabajando}
              onPress={() =>
                void ejecutar(
                  () => aceptarPrivacidad(situacion.version),
                  'No pudimos registrar tu permiso. Inténtalo de nuevo.',
                )
              }
            >
              Doy mi permiso
            </Boton>
          ) : null}

          {acciones?.puedeRetirar ? (
            confirmandoRetirada ? (
              /*
                Confirmacion en linea, sin libreria y sin `Alert`: `Alert` en
                web no existe y en la vista previa no se podria ni ver ni medir.
                Dos botones y una frase que dice lo que pasa Y lo que no.
              */
              <View style={estilos.confirmacion}>
                <Text style={estilos.pregunta}>
                  ¿Retiras tu permiso? Dejarán de registrarse mediciones nuevas. Las que ya existen
                  se conservan.
                </Text>
                <View style={estilos.botones}>
                  <View style={estilos.boton}>
                    <Boton
                      variante="peligro"
                      cargando={trabajando}
                      onPress={() =>
                        void ejecutar(
                          retirarPrivacidad,
                          'No pudimos retirar tu permiso. Inténtalo de nuevo.',
                        )
                      }
                    >
                      Retirar
                    </Boton>
                  </View>
                  <View style={estilos.boton}>
                    <Boton onPress={() => setConfirmandoRetirada(false)}>Cancelar</Boton>
                  </View>
                </View>
              </View>
            ) : (
              <Boton onPress={() => setConfirmandoRetirada(true)}>Retirar mi permiso</Boton>
            )
          ) : null}
        </View>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.md },
  encabezado: { ...tema.texto.h3, color: tema.color.texto, lineHeight: 24 },
  parrafo: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 21 },
  meta: { ...tema.texto.meta, color: tema.color.textoSecundario },
  responsable: { ...tema.texto.meta, color: tema.color.textoSecundario, lineHeight: 18 },
  version: { ...tema.texto.meta, color: tema.color.textoSecundario },

  confirmacion: { gap: tema.espacio.md },
  pregunta: { ...tema.texto.secundario, color: tema.color.texto, lineHeight: 21 },
  botones: { flexDirection: 'row', gap: tema.espacio.md },
  boton: { flex: 1 },

  espera: { gap: tema.espacio.md },
  huecoEtiqueta: { width: 150, height: 24, borderRadius: 999, backgroundColor: tema.color.superficie },
  huecoTitulo: { width: '70%', height: 22, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoTexto: { width: '100%', height: 120, borderRadius: 8, backgroundColor: tema.color.superficie },
});
