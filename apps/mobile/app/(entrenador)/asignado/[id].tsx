import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { AssignedMember, AssignedRoutine, BodyMetric } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../../src/componentes/pantalla';
import { Tarjeta } from '../../../src/componentes/tarjeta';
import { laSesionYaNoVale, motivosDeFallo } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { fechaCivil, fechaDeInstante } from '../../../src/formato/fecha';
import {
  lineaDeRutina,
  nombreDelAsignado,
  ultimaMedicion,
  valoresDeMedicion,
  type EstadoDeCarga,
} from '../../../src/entrenador/logica';
import { cargarMiSocio, cargarProgreso, cargarRutinas } from '../../../src/entrenador/fuente';
import { tema } from '../../../src/tema';

interface Ficha {
  socio: AssignedMember;
  rutinas: readonly AssignedRoutine[] | null;
  progreso: readonly BodyMetric[] | null;
}

/**
 * Un socio mio, de un vistazo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CONSULTA. NO SE PUEDE CAMBIAR NADA DESDE AQUI.                          │
 * │                                                                          │
 * │ Ni editar la rutina, ni apuntar una medicion, ni asignar nada. Programar │
 * │ es trabajo de escritorio y el panel web lo tiene; esta pantalla es para  │
 * │ mirar de pie en la sala, con la persona delante.                        │
 * │                                                                          │
 * │ Y una consecuencia buena de que sea solo lectura: no toca el             │
 * │ CONSENTIMIENTO de datos de salud. Escribir una medicion exige que este   │
 * │ concedido; leer el historial no, y no se fuerza a nadie a aceptarlo para │
 * │ poder consultar lo que ya se le apunto.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Las tres peticiones se piden a la vez y se tratan por separado: si falla el
 * progreso, la rutina se enseña igual. La ficha es la unica imprescindible —sin
 * ella no hay pantalla— y si el socio NO es suyo el servidor devuelve 404.
 */
export default function SocioAsignado() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga<Ficha>>({ fase: 'cargando' });
  const [refrescando, setRefrescando] = useState(false);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    const [socio, rutinas, progreso] = await Promise.allSettled([
      cargarMiSocio(id),
      cargarRutinas(gymId, id),
      cargarProgreso(gymId, id),
    ]);

    if (laSesionYaNoVale(motivosDeFallo([socio, rutinas, progreso]))) {
      void revisar();
      return;
    }
    if (socio.status === 'rejected') {
      setCarga({
        fase: 'fallo',
        mensaje: 'No hemos podido cargar este socio. Puede que ya no esté entre los tuyos.',
      });
      return;
    }
    setCarga({
      fase: 'ok',
      datos: {
        socio: socio.value,
        rutinas: rutinas.status === 'fulfilled' ? rutinas.value : null,
        progreso: progreso.status === 'fulfilled' ? progreso.value : null,
      },
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
    <Pantalla alRefrescar={carga.fase === 'ok' ? refrescar : undefined} refrescando={refrescando}>
      <CabeceraDeVuelta
        titulo={carga.fase === 'ok' ? nombreDelAsignado(carga.datos.socio) : 'Socio'}
        descriptor={carga.fase === 'ok' ? `nº ${carga.datos.socio.memberNumber}` : undefined}
        volverA="/entrenador"
        etiquetaDeVuelta="Mis socios"
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
  const ultima = ficha.progreso ? ultimaMedicion(ficha.progreso) : null;

  return (
    <>
      {ficha.socio.status !== 'active' ? (
        <Aviso tono="aviso">Este socio está de baja en el gimnasio.</Aviso>
      ) : null}

      <Tarjeta>
        <View style={estilos.bloque}>
          <Text style={estilos.rotulo}>Rutinas</Text>
          {ficha.rutinas === null ? (
            <Text style={estilos.texto}>No hemos podido cargar sus rutinas.</Text>
          ) : ficha.rutinas.length === 0 ? (
            <Text style={estilos.texto}>Todavía no sigue ninguna rutina.</Text>
          ) : (
            ficha.rutinas.map((rutina) => {
              const linea = lineaDeRutina(rutina, fechaCivil);
              return (
                <View key={rutina.assignmentId} style={estilos.fila}>
                  <Text style={estilos.titulo}>{linea.titulo}</Text>
                  <Text style={estilos.detalle}>{linea.detalle}</Text>
                </View>
              );
            })
          )}
        </View>
      </Tarjeta>

      <Tarjeta>
        <View style={estilos.bloque}>
          <Text style={estilos.rotulo}>Última medición</Text>
          {ficha.progreso === null ? (
            <Text style={estilos.texto}>No hemos podido cargar sus mediciones.</Text>
          ) : ultima === null ? (
            <Text style={estilos.texto}>Todavía no tiene ninguna medición registrada.</Text>
          ) : (
            <>
              {/* `measuredAt` es un INSTANTE: se enseña en la hora local. */}
              <Text style={estilos.detalle}>{fechaDeInstante(ultima.measuredAt)}</Text>
              <View style={estilos.medidas}>
                {valoresDeMedicion(ultima).map((v) => (
                  <View key={v.etiqueta} style={estilos.medida}>
                    <Text style={estilos.detalle}>{v.etiqueta}</Text>
                    <Text style={estilos.valor}>{v.valor}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </Tarjeta>
    </>
  );
}

const estilos = StyleSheet.create({
  espera: { paddingVertical: tema.espacio.xxxl, alignItems: 'center' },
  bloque: { gap: tema.espacio.sm },
  rotulo: { ...tema.texto.meta, color: tema.color.textoSecundario, letterSpacing: 1 },
  fila: { gap: 2, paddingVertical: tema.espacio.xs },
  titulo: { ...tema.texto.h3, color: tema.color.texto },
  detalle: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  texto: { ...tema.texto.cuerpo, color: tema.color.textoSecundario, lineHeight: 24 },
  medidas: { flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.lg, marginTop: tema.espacio.xs },
  medida: { gap: 2, minWidth: 84 },
  valor: { ...tema.texto.h3, color: tema.color.texto },
});
