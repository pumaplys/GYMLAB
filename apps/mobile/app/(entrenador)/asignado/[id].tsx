import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { AssignedMember, AssignedRoutine, BodyMetric } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../../src/componentes/pantalla';
import { Tarjeta } from '../../../src/componentes/tarjeta';
import { RutinasDelSocio } from '../../../src/entrenamiento/rutinas-del-socio';
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
 * │ YA NO ES SOLO CONSULTA: DESDE PARITY-1 SE ASIGNAN Y SE TERMINAN RUTINAS.│
 * │                                                                          │
 * │ Aqui ponia que programar «es trabajo de escritorio y el panel web lo     │
 * │ tiene». Esa ya no es la regla del producto: un entrenador puede hacer en │
 * │ el movil lo mismo que hace en la web, con los mismos permisos. Y es      │
 * │ ademas donde tiene sentido —se asigna una rutina con la persona delante, │
 * │ no de vuelta en el despacho—.                                            │
 * │                                                                          │
 * │ LO QUE SIGUE SIENDO SOLO LECTURA ES EL PROGRESO, y no por comodidad:     │
 * │ escribir una medicion exige el CONSENTIMIENTO de datos de salud, que es  │
 * │ otro modulo (`progress`) con sus propias reglas. Entra cuando le toque a │
 * │ ese modulo, no de rebote aqui. Leer el historial no lo exige, asi que    │
 * │ nadie tiene que aceptar nada para consultar lo que ya se le apunto.      │
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

      {carga.fase === 'ok' ? (
        <Contenido
          ficha={carga.datos}
          gymId={gymId}
          alCambiar={() => void pedir()}
          alCaducarSesion={() => void revisar()}
        />
      ) : null}
    </Pantalla>
  );
}

function Contenido({
  ficha,
  gymId,
  alCambiar,
  alCaducarSesion,
}: {
  ficha: Ficha;
  gymId: string | null;
  alCambiar: () => void;
  alCaducarSesion: () => void;
}) {
  const ultima = ficha.progreso ? ultimaMedicion(ficha.progreso) : null;

  return (
    <>
      {ficha.socio.status !== 'active' ? (
        <Aviso tono="aviso">Este socio está de baja en el gimnasio.</Aviso>
      ) : null}

      <Tarjeta>
        <RutinasDelSocio
          gymId={gymId}
          socioId={ficha.socio.id}
          rutinas={ficha.rutinas}
          puedeAsignar
          descripcionDe={(rutina) => lineaDeRutina(rutina, fechaCivil)}
          alCambiar={alCambiar}
          alCaducarSesion={alCaducarSesion}
        />
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
