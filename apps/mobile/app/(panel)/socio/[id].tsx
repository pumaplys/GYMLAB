import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { DuesStatus, Member } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Etiqueta } from '../../../src/componentes/etiqueta';
import { Pantalla } from '../../../src/componentes/pantalla';
import { Tarjeta } from '../../../src/componentes/tarjeta';
import { laSesionYaNoVale, motivosDeFallo } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { lecturaDeCuotaParaPersonal } from '../../../src/cuota/lectura';
import { fechaCivil } from '../../../src/formato/fecha';
import {
  datosDeLaFicha,
  estaDeBaja,
  nombreCompleto,
  type EstadoDeCarga,
} from '../../../src/panel/logica';
import { cargarCuota, cargarSocio } from '../../../src/panel/fuente';
import { tema } from '../../../src/tema';

interface Ficha {
  socio: Member;
  cuota: DuesStatus | null;
}

/**
 * La ficha de un socio, para quien atiende.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RESPONDE DOS PREGUNTAS Y NO ABRE NINGUNA PUERTA MAS.                    │
 * │                                                                          │
 * │ Quién es, y si está al corriente. No se puede editar, ni dar de baja,    │
 * │ ni cobrar, ni asignar un entrenador: no porque falte tiempo, sino        │
 * │ porque son decisiones que se toman sentado y con el expediente delante.  │
 * │                                                                          │
 * │ Tampoco salen las NOTAS INTERNAS, que son otro endpoint y otra decision  │
 * │ de privacidad: se escriben sobre una persona y no se leen de pie en      │
 * │ mitad de la sala con ella al lado.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CUOTA PUEDE FALTAR SIN QUE FALTE LA FICHA.                           │
 * │                                                                          │
 * │ Son dos peticiones. Si la de la cuota falla, se enseña igualmente quien  │
 * │ es —que ya es la mitad de la respuesta— y se dice que la cuota no se     │
 * │ pudo consultar, en lugar de tirar la pantalla entera. Un 401 SI es       │
 * │ distinto: eso es la sesion, y lo decide la politica de siempre.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function SocioDelPanel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga<Ficha>>({ fase: 'cargando' });
  const [refrescando, setRefrescando] = useState(false);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    const [ficha, cuota] = await Promise.allSettled([
      cargarSocio(gymId, id),
      cargarCuota(gymId, id),
    ]);

    if (laSesionYaNoVale(motivosDeFallo([ficha, cuota]))) {
      void revisar();
      return;
    }
    if (ficha.status === 'rejected') {
      setCarga({ fase: 'fallo', mensaje: 'No hemos podido cargar la ficha de este socio.' });
      return;
    }
    setCarga({
      fase: 'ok',
      datos: { socio: ficha.value, cuota: cuota.status === 'fulfilled' ? cuota.value : null },
    });
  }, [gymId, id, revisar]);

  useFocusEffect(
    useCallback(() => {
      void pedir();
    }, [pedir]),
  );

  const refrescar = useCallback(() => {
    setRefrescando(true);
    void pedir().finally(() => setRefrescando(false));
  }, [pedir]);

  return (
    <Pantalla
      alRefrescar={carga.fase === 'ok' ? refrescar : undefined}
      refrescando={refrescando}
    >
      <CabeceraDeVuelta
        titulo={carga.fase === 'ok' ? nombreCompleto(carga.datos.socio) : 'Socio'}
        volverA="/buscar"
        etiquetaDeVuelta="Buscar"
      />

      {carga.fase === 'cargando' ? (
        <View style={estilos.espera}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? <Aviso tono="peligro">{carga.mensaje}</Aviso> : null}

      {carga.fase === 'ok' ? <Contenido ficha={carga.datos} /> : null}
    </Pantalla>
  );
}

function Contenido({ ficha }: { ficha: Ficha }) {
  const { socio, cuota } = ficha;
  const lectura = cuota ? lecturaDeCuotaParaPersonal(cuota) : null;

  return (
    <>
      {estaDeBaja(socio) ? (
        // Antes que nada: si esta de baja, lo demas casi no importa.
        <Aviso tono="aviso">Este socio está de baja. La puerta no le va a dejar pasar.</Aviso>
      ) : null}

      <Tarjeta>
        <View style={estilos.bloque}>
          <Text style={estilos.rotulo}>Cuota</Text>
          {lectura ? (
            <>
              <View style={estilos.filaEtiqueta}>
                <Etiqueta tono={lectura.tono}>{lectura.titulo}</Etiqueta>
                {cuota?.planName ? <Text style={estilos.plan}>{cuota.planName}</Text> : null}
              </View>
              <Text style={estilos.explicacion}>{lectura.explicacion}</Text>
              {cuota?.hasta ? (
                <Text style={estilos.dato}>Hasta el {fechaCivil(cuota.hasta)}</Text>
              ) : null}
            </>
          ) : (
            <Text style={estilos.explicacion}>
              No hemos podido consultar la cuota. Desliza hacia abajo para reintentarlo.
            </Text>
          )}
        </View>
      </Tarjeta>

      <Tarjeta>
        <View style={estilos.bloque}>
          <Text style={estilos.rotulo}>Ficha</Text>
          {datosDeLaFicha(socio, fechaCivil).map((d) => (
            <View key={d.etiqueta} style={estilos.filaDato}>
              <Text style={estilos.etiquetaDato}>{d.etiqueta}</Text>
              <Text style={estilos.valorDato}>{d.valor}</Text>
            </View>
          ))}
        </View>
      </Tarjeta>
    </>
  );
}

const estilos = StyleSheet.create({
  espera: { paddingVertical: tema.espacio.xxxl, alignItems: 'center' },
  bloque: { gap: tema.espacio.sm },
  rotulo: { ...tema.texto.meta, color: tema.color.textoSecundario, letterSpacing: 1 },
  filaEtiqueta: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.sm },
  plan: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  explicacion: { ...tema.texto.cuerpo, color: tema.color.texto, lineHeight: 24 },
  dato: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  filaDato: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tema.espacio.lg,
    paddingVertical: tema.espacio.xs,
  },
  etiquetaDato: { ...tema.texto.secundario, color: tema.color.textoSecundario, flexShrink: 0 },
  valorDato: { ...tema.texto.secundario, color: tema.color.texto, flexShrink: 1, textAlign: 'right' },
});
