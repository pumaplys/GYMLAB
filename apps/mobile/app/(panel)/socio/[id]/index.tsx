import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { AssignedRoutine, DuesStatus, Member, MemberTrainer, Role } from '@gymlab/contracts';
import { Aviso } from '../../../../src/componentes/aviso';
import { CabeceraDeVuelta } from '../../../../src/componentes/cabecera-de-vuelta';
import { Etiqueta } from '../../../../src/componentes/etiqueta';
import { Pantalla } from '../../../../src/componentes/pantalla';
import { Tarjeta } from '../../../../src/componentes/tarjeta';
import { RutinasDelSocio } from '../../../../src/entrenamiento/rutinas-del-socio';
import { AccionesDeFicha } from '../../../../src/socios/acciones-de-ficha';
import { EntrenadoresDelSocio } from '../../../../src/personal/entrenadores-del-socio';
import { cargarEntrenadoresDeSocio } from '../../../../src/personal/fuente';
import { Boton } from '../../../../src/componentes/boton';
import { RUTAS_INTERNAS } from '../../../../src/navegacion/destinos';
import { router } from 'expo-router';
import { puedeAsignarRutinas } from '../../../../src/entrenamiento/permisos';
import { cargarRutinasDeSocio } from '../../../../src/entrenamiento/fuente';
import { laSesionYaNoVale, motivosDeFallo } from '../../../../src/auth/politica';
import { useSesion } from '../../../../src/auth/sesion';
import { lecturaDeCuotaParaPersonal } from '../../../../src/cuota/lectura';
import { fechaCivil } from '../../../../src/formato/fecha';
import {
  datosDeLaFicha,
  estaDeBaja,
  nombreCompleto,
  type EstadoDeCarga,
} from '../../../../src/panel/logica';
import { cargarCuota, cargarSocio } from '../../../../src/panel/fuente';
import { tema } from '../../../../src/tema';

interface Ficha {
  socio: Member;
  cuota: DuesStatus | null;
  /** Nulo si fallo la peticion, o si este rol no puede verlas. */
  rutinas: readonly AssignedRoutine[] | null;
  /** Nulo si fallo la peticion. Los ve todo el mostrador. */
  entrenadores: readonly MemberTrainer[] | null;
}

/**
 * La ficha de un socio, para quien atiende.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUIEN ES, SI ESTA AL CORRIENTE, Y —SI ERES EL DUEÑO— QUE ENTRENA.       │
 * │                                                                          │
 * │ Las rutinas entran en PARITY-1, y solo para el dueño: recepcion comparte │
 * │ esta pantalla y no comparte ese permiso.                                 │
 * │                                                                          │
 * │ Y desde PARITY-2 ya se puede EDITAR, invitar, dar de baja y volver a dar │
 * │ de alta; el dueño ademas exporta y elimina. La cuota y los cobros viven  │
 * │ en sus pantallas: son cinco acciones con sus confirmaciones y esta ficha │
 * │ tiene que seguir respondiendo «quien es» de un vistazo.                  │
 * │                                                                          │
 * │ Las NOTAS INTERNAS si son otra cosa: otro endpoint y otra decision de    │
 * │ privacidad. Se escriben sobre una persona y no se leen de pie en mitad   │
 * │ de la sala con ella al lado.                                             │
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
  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ ESTA FICHA LA COMPARTEN DUEÑO Y RECEPCION, Y NO PUEDEN LO MISMO.      │
   * │                                                                        │
   * │ Las rutinas son del modulo de entrenamiento, y ahi la API solo admite  │
   * │ `owner` y `trainer`. A recepcion NO se le piden siquiera: un 403 en    │
   * │ una de las tres peticiones no rompe la pantalla —se tratan por         │
   * │ separado— pero seria una peticion que se sabe de antemano que falla.   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const entrena = sesion.tipo === 'autenticado' && puedeAsignarRutinas(sesion.rol);

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    const [ficha, cuota, rutinas, entrenadores] = await Promise.allSettled([
      cargarSocio(gymId, id),
      cargarCuota(gymId, id),
      entrena ? cargarRutinasDeSocio(gymId, id) : Promise.resolve(null),
      cargarEntrenadoresDeSocio(gymId, id),
    ]);

    if (laSesionYaNoVale(motivosDeFallo([ficha, cuota, rutinas, entrenadores]))) {
      void revisar();
      return;
    }
    if (ficha.status === 'rejected') {
      setCarga({ fase: 'fallo', mensaje: 'No hemos podido cargar la ficha de este socio.' });
      return;
    }
    setCarga({
      fase: 'ok',
      datos: {
        socio: ficha.value,
        cuota: cuota.status === 'fulfilled' ? cuota.value : null,
        // `null` significa dos cosas distintas y las dos se pintan igual de
        // bien: «no se pudieron cargar» y «este rol no las ve». La segunda no
        // llega a enseñarse, porque la tarjeta entera va tras `entrena`.
        rutinas: rutinas.status === 'fulfilled' ? rutinas.value : null,
        entrenadores: entrenadores.status === 'fulfilled' ? entrenadores.value : null,
      },
    });
  }, [gymId, id, entrena, revisar]);

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

      {carga.fase === 'ok' ? (
        <Contenido
          ficha={carga.datos}
          gymId={gymId}
          entrena={entrena}
          rol={sesion.tipo === 'autenticado' ? sesion.rol : 'receptionist'}
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
  entrena,
  rol,
  alCambiar,
  alCaducarSesion,
}: {
  ficha: Ficha;
  gymId: string | null;
  entrena: boolean;
  rol: Role;
  alCambiar: () => void;
  alCaducarSesion: () => void;
}) {
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

          {/*
            Desde PARITY-2 la cuota se puede TOCAR, no solo mirar: dar de alta,
            congelar, reanudar, dar de baja y cobrar. Vive en su pantalla porque
            son cinco acciones con sus confirmaciones, y esta ficha responde
            «quien es y si puede entrar» de un vistazo.
          */}
          <Boton onPress={() => router.push(RUTAS_INTERNAS.cuotaDelSocio(socio.id))}>
            Gestionar la cuota
          </Boton>
        </View>
      </Tarjeta>

      {entrena ? (
        <Tarjeta>
          <RutinasDelSocio
            gymId={gymId}
            socioId={socio.id}
            rutinas={ficha.rutinas}
            puedeAsignar
            descripcionDe={(rutina) => ({
              titulo: rutina.name,
              detalle: `Desde el ${fechaCivil(rutina.assignedAt)}`,
            })}
            alCambiar={alCambiar}
            alCaducarSesion={alCaducarSesion}
          />
        </Tarjeta>
      ) : null}

      <Tarjeta>
        <EntrenadoresDelSocio
          gymId={gymId}
          socioId={socio.id}
          entrenadores={ficha.entrenadores}
          alCambiar={alCambiar}
          alCaducarSesion={alCaducarSesion}
        />
      </Tarjeta>

      <Tarjeta>
        <View style={estilos.bloque}>
          <Text style={estilos.rotulo}>Acciones</Text>
          <AccionesDeFicha
            socio={socio}
            gymId={gymId}
            rol={rol}
            alCambiar={alCambiar}
            alCaducarSesion={alCaducarSesion}
          />
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
