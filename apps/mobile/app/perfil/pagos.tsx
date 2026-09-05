import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { OwnPayment } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { CabeceraDeSubpantalla } from '../../src/componentes/cabecera-de-subpantalla';
import { Etiqueta } from '../../src/componentes/etiqueta';
import { Pantalla } from '../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { fechaCivil, fechaDeInstante } from '../../src/formato/fecha';
import { cargarPagos } from '../../src/perfil/fuente';
import {
  acumular,
  conceptoDePago,
  cuantosQuedan,
  estadoDePago,
  importe,
  lecturaDeImporte,
  metodoDePago,
  quedanMas,
  type Acumulado,
  type EstadoDeCarga,
} from '../../src/perfil/logica';
import { tema } from '../../src/tema';

/**
 * Mis pagos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RESPONDE "¿QUE ME HAN COBRADO Y CUANDO?". NO ES CONTABILIDAD.           │
 * │                                                                          │
 * │ Lo primero de cada fila es el IMPORTE, que es lo que se viene a mirar;   │
 * │ debajo el concepto, la forma de pago y la fecha. Sin columnas, sin       │
 * │ totales y sin saldo: nada de eso existe en el contrato.                  │
 * │                                                                          │
 * │ Y sin botones de pagar, descargar factura o reclamar. La API no ofrece   │
 * │ ninguna de las tres, y un boton que no hace nada es peor que su ausencia.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `paidOn` ES UNA FECHA CIVIL. `voidedAt` ES UN INSTANTE.                 │
 * │                                                                          │
 * │ Otra vez las dos clases, y esta vez en la misma fila. `paid_on` es una   │
 * │ columna `date` que la API emite CRUDA —"2026-08-20", el dia que se       │
 * │ recibio el dinero— y `voided_at` es un `timestamptz` con `toISOString()`.│
 * │                                                                          │
 * │ Formatear la primera como instante la moveria un dia al oeste de         │
 * │ Greenwich: un pago del 20 apareceria como del 19.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Pagos() {
  const { revisar } = useSesion();
  const [carga, setCarga] = useState<EstadoDeCarga<Acumulado<OwnPayment>>>({ fase: 'cargando' });
  const [refrescando, setRefrescando] = useState(false);
  const [trayendoMas, setTrayendoMas] = useState(false);

  const pedir = useCallback(
    async (pagina: number, previo: Acumulado<OwnPayment> | null) => {
      try {
        const respuesta = await cargarPagos(pagina);
        setCarga({ fase: 'ok', datos: acumular(previo, respuesta) });
      } catch (problema) {
        if (laSesionYaNoVale([problema])) {
          void revisar();
          return;
        }
        // Si ya habia paginas, un fallo al traer la siguiente NO borra lo que
        // se estaba leyendo: se queda lo que hay.
        if (previo) return;
        setCarga({ fase: 'fallo', mensaje: 'No pudimos cargar tus pagos.' });
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
    // Desde la primera pagina: refrescar es volver a empezar, no seguir.
    void pedir(1, null).finally(() => setRefrescando(false));
  }, [pedir]);

  const traerMas = useCallback(() => {
    if (carga.fase !== 'ok') return;
    setTrayendoMas(true);
    void pedir(carga.datos.pagina + 1, carga.datos).finally(() => setTrayendoMas(false));
  }, [carga, pedir]);

  return (
    <Pantalla
      alRefrescar={carga.fase === 'ok' ? refrescar : undefined}
      refrescando={refrescando}
    >
      <CabeceraDeSubpantalla titulo="Pagos" descriptor="Lo que has pagado en este gimnasio" />

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
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTitulo}>Todavía no hay pagos.</Text>
          <Text style={estilos.vacioTexto}>
            Cuando tu gimnasio registre un cobro, aparecerá aquí.
          </Text>
        </View>
      ) : null}

      {carga.fase === 'ok' && carga.datos.elementos.length > 0 ? (
        <View>
          {carga.datos.elementos.map((pago, i) => (
            <FilaDePago key={pago.id} pago={pago} primera={i === 0} />
          ))}

          {/*
            Traer mas paginas. El contrato pagina de verdad —hasta 100 por
            pagina— y un socio de cinco años acumula sesenta pagos: quedarse
            en la primera dejaria datos suyos fuera de su alcance.
          */}
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

function FilaDePago({ pago, primera }: { pago: OwnPayment; primera: boolean }) {
  const estado = estadoDePago(pago);
  const cantidad = importe(pago.amountCents, pago.currency);

  return (
    <View
      style={[estilos.fila, primera && estilos.filaPrimera]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={lecturaDeFila(pago)}
    >
      <View style={estilos.cabeceraDeFila} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <Text style={[estilos.importe, estado.anulado && estilos.importeAnulado]}>{cantidad}</Text>
        {estado.anulado ? <Etiqueta tono="peligro">Anulado</Etiqueta> : null}
      </View>

      <Text style={estilos.detalle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {[conceptoDePago(pago), metodoDePago(pago), fechaCivil(pago.paidOn)].join(' · ')}
      </Text>

      {/*
        Un pago anulado no se esconde: anular retira el periodo que concedio, y
        es justo lo que explica por que una cuota volvio atras.
      */}
      {estado.anulado ? (
        <Text style={estilos.motivo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          {`Anulado el ${fechaDeInstante(estado.iso)}${estado.motivo ? `: ${estado.motivo}` : ''}`}
        </Text>
      ) : null}
    </View>
  );
}

/** Lo que oye un lector: una frase, con la moneda dicha en palabras. */
function lecturaDeFila(pago: OwnPayment): string {
  const estado = estadoDePago(pago);
  const base =
    `${conceptoDePago(pago)}: ${lecturaDeImporte(pago.amountCents, pago.currency)}, ` +
    `${metodoDePago(pago).toLowerCase()}, ${fechaCivil(pago.paidOn)}`;
  if (!estado.anulado) return base;
  return `${base}. Anulado el ${fechaDeInstante(estado.iso)}${estado.motivo ? `: ${estado.motivo}` : ''}`;
}

/** La espera: tres filas con la forma de un pago, sin animacion. */
function Espera() {
  return (
    <View accessible accessibilityLabel="Cargando tus pagos">
      {[0, 1, 2].map((i) => (
        <View key={i} style={[estilos.fila, i === 0 && estilos.filaPrimera]}>
          <View style={estilos.huecoImporte} />
          <View style={estilos.huecoDetalle} />
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
  cabeceraDeFila: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.md },
  importe: { ...tema.texto.h2, color: tema.color.texto },
  // Tachado ademas de la etiqueta: el estado no depende solo del color.
  importeAnulado: { color: tema.color.textoSecundario, textDecorationLine: 'line-through' },
  detalle: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  motivo: { ...tema.texto.meta, color: tema.color.peligro },

  mas: { marginTop: tema.espacio.lg },

  vacio: { gap: tema.espacio.sm },
  vacioTitulo: { ...tema.texto.h3, color: tema.color.texto },
  vacioTexto: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },

  huecoImporte: { width: 110, height: 24, borderRadius: 4, backgroundColor: tema.color.superficie },
  huecoDetalle: { width: '70%', height: 16, borderRadius: 4, backgroundColor: tema.color.superficie },
});
