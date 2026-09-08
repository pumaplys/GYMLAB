import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { DuesStatus, Plan } from '@gymlab/contracts';
import { Aviso } from '../../../../src/componentes/aviso';
import { Boton } from '../../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../../src/componentes/cabecera-de-vuelta';
import { Etiqueta } from '../../../../src/componentes/etiqueta';
import { Pantalla } from '../../../../src/componentes/pantalla';
import { Tarjeta } from '../../../../src/componentes/tarjeta';
import { laSesionYaNoVale, motivosDeFallo } from '../../../../src/auth/politica';
import { useSesion } from '../../../../src/auth/sesion';
import { lecturaDeCuotaParaPersonal } from '../../../../src/cuota/lectura';
import { fechaCivil } from '../../../../src/formato/fecha';
import { importe } from '../../../../src/perfil/logica';
import {
  NOMBRE_DEL_PERIODO,
  accionesDeCuota,
  planesContratables,
  sePuedeDarDeAlta,
  sinAcciones,
} from '../../../../src/cobros/logica';
import { ETIQUETA_BAJA_DE_CUOTA } from '../../../../src/socios/gestion';
import {
  cargarCuotaDeSocio,
  cargarPlanes,
  congelarCuota,
  darDeAltaCuota,
  darDeBajaCuota,
  reanudarCuota,
} from '../../../../src/socios/fuente';
import { RUTAS_INTERNAS } from '../../../../src/navegacion/destinos';
import { tema } from '../../../../src/tema';

/**
 * La cuota de un socio: como esta y que se puede hacer con ella.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO APARECE LO QUE EL ESTADO PERMITE.                                   │
 * │                                                                          │
 * │ `accionesDeCuota` copia las reglas del servidor: una cuota vencida no se │
 * │ congela —no quedan dias que guardar— y una pausada no se vuelve a        │
 * │ congelar. Un boton que siempre falla es peor que no tenerlo.             │
 * │                                                                          │
 * │ Y la unica accion que aparece cuando NO hay cuota es darla de alta.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `Dar de baja LA CUOTA` dice de que, porque en la ficha hay otra baja que es
 * la del socio. Son cosas distintas y confundirlas asusta con razon.
 */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'ok'; cuota: DuesStatus; planes: readonly Plan[] }
  | { fase: 'fallo' };

type Confirmando = 'congelar' | 'reanudar' | 'baja' | null;

const PREGUNTA: Record<'congelar' | 'reanudar' | 'baja', string> = {
  congelar:
    '¿Congelar la cuota? Deja de poder entrar y los días que le quedan se guardan para cuando se reanude.',
  reanudar: '¿Reanudar la cuota? Vuelve a poder entrar con los días que tenía guardados.',
  baja: '¿Dar de baja la cuota? Deja de poder entrar. El socio sigue siendo socio y los pagos se conservan.',
};

export default function CuotaDelSocio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [confirmando, setConfirmando] = useState<Confirmando>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [planElegido, setPlanElegido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    const [cuota, planes] = await Promise.allSettled([
      cargarCuotaDeSocio(gymId, id),
      cargarPlanes(gymId),
    ]);
    if (laSesionYaNoVale(motivosDeFallo([cuota, planes]))) {
      void revisar();
      return;
    }
    if (cuota.status === 'rejected') {
      setCarga({ fase: 'fallo' });
      return;
    }
    setCarga({
      fase: 'ok',
      cuota: cuota.value,
      // Sin planes no se puede dar de alta, pero SI se puede congelar o dar de
      // baja lo que ya hay: un fallo al traer el catalogo no apaga la pantalla.
      planes: planes.status === 'fulfilled' ? planes.value : [],
    });
  }, [gymId, id, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function ejecutar(accion: 'congelar' | 'reanudar' | 'baja') {
    if (!gymId || !id || trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      if (accion === 'congelar') await congelarCuota(gymId, id);
      else if (accion === 'reanudar') await reanudarCuota(gymId, id);
      else await darDeBajaCuota(gymId, id);
      setConfirmando(null);
      await pedir();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos hacerlo. Inténtalo de nuevo.',
      );
      setConfirmando(null);
    } finally {
      setTrabajando(false);
    }
  }

  async function darDeAlta() {
    if (!gymId || !id || !planElegido || trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      await darDeAltaCuota(gymId, id, { planId: planElegido });
      setPlanElegido(null);
      await pedir();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos dar de alta la cuota. Inténtalo de nuevo.',
      );
    } finally {
      setTrabajando(false);
    }
  }

  const lectura = carga.fase === 'ok' ? lecturaDeCuotaParaPersonal(carga.cuota) : null;
  const puede = carga.fase === 'ok' ? accionesDeCuota(carga.cuota.estado) : null;
  const contratables = carga.fase === 'ok' ? planesContratables(carga.planes) : [];

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo="Cuota"
        volverA={id ? RUTAS_INTERNAS.socioDelPanel(id) : '/buscar'}
        etiquetaDeVuelta="Ficha"
      />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos consultar la cuota.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' && lectura ? (
        <>
          <Tarjeta>
            <View style={estilos.bloque}>
              <View style={estilos.filaEtiqueta}>
                <Etiqueta tono={lectura.tono}>{lectura.titulo}</Etiqueta>
                {carga.cuota.planName ? (
                  <Text style={estilos.plan}>{carga.cuota.planName}</Text>
                ) : null}
              </View>
              <Text style={estilos.explicacion}>{lectura.explicacion}</Text>
              {carga.cuota.hasta ? (
                <Text style={estilos.dato}>Cubierta hasta el {fechaCivil(carga.cuota.hasta)}</Text>
              ) : null}
            </View>
          </Tarjeta>

          {/* Dar de alta: la unica accion cuando no hay ninguna cuota viva. */}
          {sePuedeDarDeAlta(carga.cuota.estado) ? (
            <Tarjeta>
              <View style={estilos.bloque}>
                <Text style={estilos.rotulo}>Dar de alta una cuota</Text>
                {contratables.length === 0 ? (
                  <Text style={estilos.explicacion}>
                    No hay ningún plan activo que contratar. Crea uno primero.
                  </Text>
                ) : (
                  <>
                    <Text style={estilos.explicacion}>Elige un plan:</Text>
                    {contratables.map((plan) => {
                      const elegido = plan.id === planElegido;
                      return (
                        <Pressable
                          key={plan.id}
                          onPress={() => setPlanElegido(plan.id)}
                          disabled={trabajando}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: elegido }}
                          style={({ pressed }) => [
                            estilos.opcion,
                            elegido && estilos.opcionElegida,
                            pressed && estilos.pulsado,
                          ]}
                        >
                          <Text style={estilos.nombrePlan}>{plan.name}</Text>
                          <Text style={estilos.detallePlan}>
                            {importe(plan.priceCents, plan.currency)} ·{' '}
                            {NOMBRE_DEL_PERIODO[plan.period].toLowerCase()}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Boton
                      variante="primario"
                      onPress={() => void darDeAlta()}
                      deshabilitado={!planElegido || trabajando}
                      cargando={trabajando}
                    >
                      Dar de alta la cuota
                    </Boton>
                  </>
                )}
              </View>
            </Tarjeta>
          ) : null}

          {/* Y el ciclo de vida de la que ya existe. */}
          {puede && !sinAcciones(carga.cuota.estado) ? (
            <Tarjeta>
              <View style={estilos.bloque}>
                {confirmando ? (
                  <>
                    <Text style={estilos.explicacion}>{PREGUNTA[confirmando]}</Text>
                    <Boton
                      variante={confirmando === 'baja' ? 'peligro' : 'primario'}
                      onPress={() => void ejecutar(confirmando)}
                      cargando={trabajando}
                      deshabilitado={trabajando}
                    >
                      Sí, seguir
                    </Boton>
                    <Boton onPress={() => setConfirmando(null)} deshabilitado={trabajando}>
                      Dejarlo como está
                    </Boton>
                  </>
                ) : (
                  <>
                    {puede.congelar ? (
                      <Boton onPress={() => setConfirmando('congelar')}>Congelar la cuota</Boton>
                    ) : null}
                    {puede.reanudar ? (
                      <Boton onPress={() => setConfirmando('reanudar')}>Reanudar la cuota</Boton>
                    ) : null}
                    {puede.darDeBaja ? (
                      <Boton onPress={() => setConfirmando('baja')}>{ETIQUETA_BAJA_DE_CUOTA}</Boton>
                    ) : null}
                  </>
                )}
              </View>
            </Tarjeta>
          ) : null}

          <Boton onPress={() => router.push(RUTAS_INTERNAS.pagosDelSocio(id ?? ''))}>
            Ver los pagos
          </Boton>
        </>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  bloque: { gap: tema.espacio.md },
  filaEtiqueta: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.md },
  plan: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  explicacion: { ...tema.texto.secundario, color: tema.color.texto, lineHeight: 22 },
  dato: { ...tema.texto.meta, color: tema.color.textoSecundario },
  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tema.color.textoSecundario,
  },
  opcion: {
    borderRadius: tema.radio.campo,
    borderWidth: 1,
    borderColor: tema.color.borde,
    padding: tema.espacio.md,
    gap: 2,
  },
  opcionElegida: {
    borderColor: tema.tinte.borde('acento'),
    backgroundColor: tema.tinte.fondo('acento'),
  },
  pulsado: { opacity: 0.6 },
  nombrePlan: { ...tema.texto.cuerpo, color: tema.color.texto, fontWeight: '600' },
  detallePlan: { ...tema.texto.meta, color: tema.color.textoSecundario },
});
