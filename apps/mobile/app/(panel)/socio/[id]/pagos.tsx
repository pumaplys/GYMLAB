import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Payment } from '@gymlab/contracts';
import { registerPaymentSchema, voidPaymentSchema } from '@gymlab/contracts';
import { Aviso } from '../../../../src/componentes/aviso';
import { Boton } from '../../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../../src/componentes/cabecera-de-vuelta';
import { Campo } from '../../../../src/componentes/campo';
import { Etiqueta } from '../../../../src/componentes/etiqueta';
import { Pantalla } from '../../../../src/componentes/pantalla';
import { Tarjeta } from '../../../../src/componentes/tarjeta';
import { laSesionYaNoVale } from '../../../../src/auth/politica';
import { useSesion } from '../../../../src/auth/sesion';
import { fechaCivil } from '../../../../src/formato/fecha';
import { importe } from '../../../../src/perfil/logica';
import {
  CONCEPTOS,
  METODOS,
  NOMBRE_DEL_CONCEPTO,
  NOMBRE_DEL_METODO,
  aCentimos,
  cobroAEnvio,
  type MetodoDePago,
} from '../../../../src/cobros/logica';
import { puedeAnularPagos } from '../../../../src/socios/permisos';
import { anularPago, cargarPagos, registrarPago } from '../../../../src/socios/fuente';
import { RUTAS_INTERNAS } from '../../../../src/navegacion/destinos';
import { tema } from '../../../../src/tema';
import type { PaymentConcept } from '@gymlab/contracts';

/**
 * El historial economico de un socio, y el mostrador para cobrar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ANULAR NO BORRA, Y ES DEL DUEÑO.                                        │
 * │                                                                          │
 * │ Un pago anulado se queda en la lista con su motivo: un cobro que         │
 * │ desaparece deja un descuadre que nadie puede explicar seis meses         │
 * │ despues. Por eso el motivo es obligatorio —lo exige el contrato— y por   │
 * │ eso `POST /payments/:id/void` es `@Roles('owner')`.                      │
 * │                                                                          │
 * │ Un pago YA anulado no vuelve a ofrecer la accion: el servidor responde   │
 * │ que no y ofrecerlo seria un boton que siempre falla.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
type Carga = { fase: 'cargando' } | { fase: 'ok'; pagos: Payment[] } | { fase: 'fallo' };

export default function PagosDelSocio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [cobrando, setCobrando] = useState(false);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El formulario de cobro.
  const [concepto, setConcepto] = useState<PaymentConcept>('subscription');
  const [metodo, setMetodo] = useState<MetodoDePago>('cash');
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const puedeAnular = sesion.tipo === 'autenticado' && puedeAnularPagos(sesion.rol);

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    setCarga({ fase: 'cargando' });
    try {
      setCarga({ fase: 'ok', pagos: await cargarPagos(gymId, id) });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo' });
    }
  }, [gymId, id, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function cobrar() {
    if (!gymId || !id || trabajando) return;
    const centimos = aCentimos(cantidad);
    if (centimos === null) {
      setError('Escribe un importe como 35 o 19,99.');
      return;
    }
    const envio = cobroAEnvio(concepto, metodo, centimos, nota);
    const revisado = registerPaymentSchema.safeParse(envio);
    if (!revisado.success) {
      setError('Revisa el importe: no puede ser cero ni desorbitado.');
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      await registrarPago(gymId, id, revisado.data);
      setCobrando(false);
      setCantidad('');
      setNota('');
      await pedir();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos registrar el pago. Inténtalo de nuevo.',
      );
    } finally {
      setTrabajando(false);
    }
  }

  async function anular(pagoId: string) {
    if (!gymId || trabajando) return;
    if (!voidPaymentSchema.safeParse({ reason: motivo }).success) {
      setError('El motivo es obligatorio: escribe al menos tres caracteres.');
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      await anularPago(gymId, pagoId, motivo.trim());
      setAnulando(null);
      setMotivo('');
      await pedir();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos anular el pago. Inténtalo de nuevo.',
      );
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Pantalla alRefrescar={carga.fase === 'ok' ? () => void pedir() : undefined}>
      <CabeceraDeVuelta
        titulo="Pagos"
        volverA={id ? RUTAS_INTERNAS.cuotaDelSocio(id) : '/buscar'}
        etiquetaDeVuelta="Cuota"
      />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {cobrando ? (
        <Tarjeta>
          <View style={estilos.bloque}>
            <Text style={estilos.rotulo}>Registrar un pago</Text>

            <Pastillas
              titulo="Concepto"
              opciones={CONCEPTOS.map((c) => ({ valor: c, texto: NOMBRE_DEL_CONCEPTO[c] }))}
              elegido={concepto}
              alElegir={(v) => setConcepto(v as PaymentConcept)}
              deshabilitado={trabajando}
            />
            <Pastillas
              titulo="Método"
              opciones={METODOS.map((m) => ({ valor: m, texto: NOMBRE_DEL_METODO[m] }))}
              elegido={metodo}
              alElegir={(v) => setMetodo(v as MetodoDePago)}
              deshabilitado={trabajando}
            />

            <Campo
              etiqueta="Importe"
              valor={cantidad}
              alCambiar={setCantidad}
              keyboardType="decimal-pad"
              deshabilitado={trabajando}
              ayuda="En euros: 35 o 19,99."
            />
            <Campo
              etiqueta="Nota"
              valor={nota}
              alCambiar={setNota}
              deshabilitado={trabajando}
              ayuda="Opcional."
            />

            {/*
              La fecha NO se pide: el servidor pone hoy en la zona horaria del
              gimnasio. Mandar la del telefono seria mandar la del huso de quien
              cobra, que puede no ser el mismo dia.
            */}
            <Boton
              variante="primario"
              onPress={() => void cobrar()}
              cargando={trabajando}
              deshabilitado={trabajando}
            >
              Registrar el pago
            </Boton>
            <Boton onPress={() => setCobrando(false)} deshabilitado={trabajando}>
              Cancelar
            </Boton>
          </View>
        </Tarjeta>
      ) : (
        <Boton variante="primario" onPress={() => setCobrando(true)}>
          Registrar pago
        </Boton>
      )}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar los pagos.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <View style={estilos.lista}>
          {carga.pagos.map((pago) => {
            const anulado = pago.voidedAt !== null;
            return (
              <Tarjeta key={pago.id}>
                <View style={estilos.bloque}>
                  <View style={estilos.filaEtiqueta}>
                    <Text style={estilos.cantidad}>
                      {importe(pago.amountCents, pago.currency)}
                    </Text>
                    {anulado ? <Etiqueta tono="peligro">Anulado</Etiqueta> : null}
                  </View>
                  <Text style={estilos.detalle}>
                    {NOMBRE_DEL_CONCEPTO[pago.concept]} · {NOMBRE_DEL_METODO[pago.method]} ·{' '}
                    {fechaCivil(pago.paidOn)}
                  </Text>
                  {pago.voidReason ? (
                    <Text style={estilos.detalle}>Motivo: {pago.voidReason}</Text>
                  ) : null}

                  {puedeAnular && !anulado ? (
                    anulando === pago.id ? (
                      <>
                        <Campo
                          etiqueta="Motivo de la anulación"
                          valor={motivo}
                          alCambiar={setMotivo}
                          deshabilitado={trabajando}
                          ayuda="Obligatorio: un cobro anulado sin explicación no es auditable."
                        />
                        <Boton
                          variante="peligro"
                          onPress={() => void anular(pago.id)}
                          cargando={trabajando}
                          deshabilitado={trabajando}
                        >
                          Anular el pago
                        </Boton>
                        <Boton onPress={() => setAnulando(null)} deshabilitado={trabajando}>
                          Dejarlo
                        </Boton>
                      </>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setAnulando(pago.id);
                          setMotivo('');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Anular el pago de ${importe(pago.amountCents, pago.currency)}`}
                        style={({ pressed }) => [estilos.anular, pressed && estilos.pulsado]}
                      >
                        <Text style={estilos.textoAnular}>Anular</Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              </Tarjeta>
            );
          })}

          {carga.pagos.length === 0 ? (
            <Text style={estilos.vacio}>Todavía no hay ningún pago registrado.</Text>
          ) : null}
        </View>
      ) : null}
    </Pantalla>
  );
}

/** Un grupo de opciones fijas. Caben enteras en 390 px y se ven de un vistazo. */
function Pastillas({
  titulo,
  opciones,
  elegido,
  alElegir,
  deshabilitado,
}: {
  titulo: string;
  opciones: { valor: string; texto: string }[];
  elegido: string;
  alElegir: (valor: string) => void;
  deshabilitado: boolean;
}) {
  return (
    <View style={estilos.grupo}>
      <Text style={estilos.rotulo}>{titulo}</Text>
      <View style={estilos.pastillas}>
        {opciones.map((o) => {
          const activa = o.valor === elegido;
          return (
            <Pressable
              key={o.valor}
              onPress={() => alElegir(o.valor)}
              disabled={deshabilitado}
              accessibilityRole="radio"
              accessibilityState={{ selected: activa }}
              style={({ pressed }) => [
                estilos.pastilla,
                activa && estilos.pastillaElegida,
                pressed && estilos.pulsado,
              ]}
            >
              <Text style={[estilos.textoPastilla, activa && estilos.textoElegido]}>{o.texto}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  lista: { gap: tema.espacio.md },
  bloque: { gap: tema.espacio.md },
  grupo: { gap: tema.espacio.sm },
  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tema.color.textoSecundario,
  },
  pastillas: { flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.sm },
  pastilla: {
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
    paddingHorizontal: tema.espacio.lg,
    borderRadius: tema.radio.pastilla,
    borderWidth: 1,
    borderColor: tema.color.borde,
    backgroundColor: tema.color.superficie,
  },
  pastillaElegida: {
    borderColor: tema.tinte.borde('acento'),
    backgroundColor: tema.tinte.fondo('acento'),
  },
  textoPastilla: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  textoElegido: { color: tema.color.texto, fontWeight: '600' },
  filaEtiqueta: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.md },
  cantidad: { ...tema.texto.h3, color: tema.color.texto },
  detalle: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },
  anular: {
    alignSelf: 'flex-start',
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
  },
  textoAnular: { ...tema.texto.secundario, color: tema.tinte.borde('peligro') },
  pulsado: { opacity: 0.6 },
  vacio: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 22 },
});
