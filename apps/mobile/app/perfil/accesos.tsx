import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { OwnAccessEvent } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { CabeceraDeSubpantalla } from '../../src/componentes/cabecera-de-subpantalla';
import { Etiqueta } from '../../src/componentes/etiqueta';
import { Pantalla } from '../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { fechaDeInstante, horaDeInstante } from '../../src/formato/fecha';
import { cargarAccesos } from '../../src/perfil/fuente';
import {
  acumular,
  cuantosQuedan,
  lecturaDeAcceso,
  quedanMas,
  type Acumulado,
  type EstadoDeCarga,
} from '../../src/perfil/logica';
import { tema } from '../../src/tema';

/**
 * Mis accesos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RESPONDE "¿CUANDO SE REGISTRARON MIS ACCESOS?" Y NADA MAS.              │
 * │                                                                          │
 * │ NO HAY PUERTA. `OwnAccessEvent` son cuatro campos —`decision`,           │
 * │ `reason`, `isRetry` y `occurredAt`— y ninguno dice por donde se entro.   │
 * │ "Entraste por la principal" seria una frase inventada sobre un sitio     │
 * │ fisico que el servidor no conoce.                                        │
 * │                                                                          │
 * │ El resultado SI existe, asi que se dice con PALABRAS —"Entrada",         │
 * │ "Entrada con aviso", "Entrada denegada"— y con su motivo. El color       │
 * │ acompaña; no informa por su cuenta.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `occurredAt` es un INSTANTE: `timestamptz` con `toISOString()`. Se enseña en
 * la hora local de quien mira, que es la unica que le sirve para reconocer
 * "el martes por la tarde".
 */
export default function Accesos() {
  const { revisar } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga<Acumulado<OwnAccessEvent>>>({ fase: 'cargando' });
  const [refrescando, setRefrescando] = useState(false);
  const [trayendoMas, setTrayendoMas] = useState(false);

  const pedir = useCallback(
    async (pagina: number, previo: Acumulado<OwnAccessEvent> | null) => {
      try {
        const respuesta = await cargarAccesos(pagina);
        setCarga({ fase: 'ok', datos: acumular(previo, respuesta) });
      } catch (problema) {
        if (laSesionYaNoVale([problema])) {
          void revisar();
          return;
        }
        if (previo) return;
        setCarga({ fase: 'fallo', mensaje: 'No pudimos cargar tus accesos.' });
      }
    },
    [revisar],
  );

  useFocusEffect(
    useCallback(() => {
      void pedir(1, null);
    }, [pedir]),
  );

  const refrescar = useCallback(() => {
    setRefrescando(true);
    void pedir(1, null).finally(() => setRefrescando(false));
  }, [pedir]);

  const traerMas = useCallback(() => {
    if (carga.fase !== 'ok') return;
    setTrayendoMas(true);
    void pedir(carga.datos.pagina + 1, carga.datos).finally(() => setTrayendoMas(false));
  }, [carga, pedir]);

  return (
    <Pantalla alRefrescar={carga.fase === 'ok' ? refrescar : undefined} refrescando={refrescando}>
      <CabeceraDeSubpantalla titulo="Accesos" descriptor="Tus accesos en este gimnasio" />

      {carga.fase === 'cargando' ? <Espera /> : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">{carga.mensaje}</Aviso>
          <Boton variante="primario" onPress={() => void pedir(1, null)}>
            Reintentar
          </Boton>
        </>
      ) : null}

      {carga.fase === 'ok' && carga.datos.elementos.length === 0 ? (
        /*
          El estado que de verdad se va a ver: la base de datos de desarrollo
          no tiene ni un acceso registrado. Sin CTA: el socio no se registra
          una entrada a si mismo, la registra el escaner de la puerta.

          El texto habla de USAR el carne, no de entrar: este listado tambien
          recoge WARN y DENY, donde el intento quedo registrado y la persona
          NO llego a pasar. Prometer "quedara registrado cuando entres" seria
          decir que aqui solo hay entradas conseguidas, y no es cierto.
        */
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTitulo}>Todavía no hay accesos.</Text>
          <Text style={estilos.vacioTexto}>
            Cuando uses tu carné en el gimnasio, tus accesos aparecerán aquí.
          </Text>
        </View>
      ) : null}

      {carga.fase === 'ok' && carga.datos.elementos.length > 0 ? (
        <View>
          {carga.datos.elementos.map((evento, i) => (
            <FilaDeAcceso key={`${evento.occurredAt}-${i}`} evento={evento} primera={i === 0} />
          ))}

          {quedanMas(carga.datos) ? (
            <View style={estilos.mas}>
              <Boton onPress={traerMas} cargando={trayendoMas}>
                {`Ver ${cuantosQuedan(carga.datos)} más`}
              </Boton>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pantalla>
  );
}

function FilaDeAcceso({ evento, primera }: { evento: OwnAccessEvent; primera: boolean }) {
  const lectura = lecturaDeAcceso(evento);

  return (
    <View
      style={[estilos.fila, primera && estilos.filaPrimera]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={lecturaCompleta(evento)}
    >
      <View style={estilos.cabeceraDeFila} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <Text style={estilos.cuando}>
          {`${fechaDeInstante(evento.occurredAt)} · ${horaDeInstante(evento.occurredAt)}`}
        </Text>
        <Etiqueta tono={lectura.tono}>{lectura.titulo}</Etiqueta>
      </View>

      <Text style={estilos.motivo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {lectura.detalle}
        {/*
          El reintento se dice: sin el, dos filas identicas al mismo segundo
          parecerian dos entradas y quien lo mire pensaria que alguien uso su
          codigo dos veces.
        */}
        {lectura.esReintento ? ' · Reintento del lector' : ''}
      </Text>
    </View>
  );
}

function lecturaCompleta(evento: OwnAccessEvent): string {
  const lectura = lecturaDeAcceso(evento);
  return (
    `${lectura.titulo}. ${lectura.detalle}. ` +
    `${fechaDeInstante(evento.occurredAt)} a las ${horaDeInstante(evento.occurredAt)}` +
    (lectura.esReintento ? '. Reintento del lector' : '')
  );
}

function Espera() {
  return (
    <View accessible accessibilityLabel="Cargando tus accesos">
      {[0, 1, 2].map((i) => (
        <View key={i} style={[estilos.fila, i === 0 && estilos.filaPrimera]}>
          <View style={estilos.huecoCuando} />
          <View style={estilos.huecoMotivo} />
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: {
    gap: tema.espacio.xs,
    paddingVertical: tema.espacio.md,
    borderTopWidth: 1,
    borderTopColor: tema.color.borde,
  },
  filaPrimera: { borderTopWidth: 0, paddingTop: 0 },
  cabeceraDeFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tema.espacio.md,
  },
  cuando: { ...tema.texto.cuerpo, fontWeight: '600', color: tema.color.texto },
  motivo: { ...tema.texto.secundario, color: tema.color.textoSecundario },

  mas: { marginTop: tema.espacio.lg },

  vacio: { gap: tema.espacio.sm },
  vacioTitulo: { ...tema.texto.h3, color: tema.color.texto },
  vacioTexto: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },

  huecoCuando: { width: '55%', height: 20, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoMotivo: { width: '40%', height: 16, borderRadius: 4, backgroundColor: tema.color.superficie },
});
