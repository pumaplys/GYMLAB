'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OwnPaymentList } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Etiqueta } from '@/componentes/etiqueta';
import { MarcoSocio } from '@/componentes/marco-socio';
import { Paginacion } from '@/componentes/paginacion';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha, comoImporte } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import { CONCEPTO, METODO } from '../historial-logica';
import estilos from './pagos.module.css';

const POR_PAGINA = 20;

/**
 * Mis pagos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS ANULADOS SE VEN, Y ES LO IMPORTANTE DE ESTA PANTALLA.               │
 * │                                                                          │
 * │ Anular un pago RETIRA el periodo que concedio. Si se escondieran, el     │
 * │ socio veria que su cuota vuelve atras sin ninguna explicacion — y lo     │
 * │ primero que pensaria es que el sistema se equivoco.                      │
 * │                                                                          │
 * │ Por eso salen, con su motivo, y marcados de dos formas: etiqueta y texto.│
 * │ Quien no distingue colores tiene que poder saberlo igual.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * SOLO LECTURA. No hay pagar, ni factura, ni devolución: nada de eso existe en
 * la API, y un boton que no hace nada es peor que no tenerlo.
 */
export default function MisPagosPage() {
  return (
    <RutaPrivada>
      <MarcoSocio>
        <MisPagos />
      </MarcoSocio>
    </RutaPrivada>
  );
}

function MisPagos() {
  const { gymId, revisar } = useSesion();
  const [datos, setDatos] = useState<OwnPaymentList | null>(null);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
   * El cambio de gimnasio reinicia la pagina.
   *
   * Sin esto, alguien que esta en la pagina 3 de un gimnasio con sesenta pagos
   * cambia a otro donde tiene dos y recibe una pagina vacia que parece "no
   * tienes pagos". El numero de pagina no significa lo mismo en otro historial.
   */
  useEffect(() => {
    setPagina(1);
    setDatos(null);
    setError(null);
  }, [gymId]);

  const cargar = useCallback(
    (signal?: AbortSignal) => {
      if (!gymId) return;
      setCargando(true);
      setError(null);
      api.yo
        .misPagos({ page: pagina, pageSize: POR_PAGINA }, { signal })
        .then((lista) => {
          setDatos(lista);
          setCargando(false);
        })
        .catch((problema: unknown) => {
          if (signal?.aborted) return;
          if (esSesionCaducada(problema)) {
            void revisar();
            return;
          }
          /*
           * NO se borra lo que ya estaba: si falla la pagina siguiente, quien
           * mira conserva lo que tenia delante y puede reintentar. Vaciar la
           * pantalla ante un fallo de red castiga dos veces.
           */
          setError(mensajeDeError(problema));
          setCargando(false);
        });
    },
    [gymId, pagina, revisar],
  );

  useEffect(() => {
    const control = new AbortController();
    cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  return (
    <>
      <EncabezadoDePagina
        titulo="Tus pagos"
        entradilla="Lo que has pagado en este gimnasio, de lo mas reciente a lo mas antiguo."
      />

      {error && (
        <Aviso>
          <span className={estilos.errorFila}>
            {error}
            <Boton tamano="sm" onClick={() => cargar()}>
              Reintentar
            </Boton>
          </span>
        </Aviso>
      )}

      {cargando && datos === null ? (
        <Cargando>Cargando tus pagos…</Cargando>
      ) : datos && datos.items.length > 0 ? (
        <>
          <ul className={estilos.lista}>
            {datos.items.map((pago) => {
              const anulado = pago.voidedAt !== null;
              return (
                <li key={pago.id}>
                  <Tarjeta className={anulado ? estilos.pagoAnulado : estilos.pago}>
                    <div className={estilos.cabecera}>
                      <span className={estilos.concepto}>{CONCEPTO[pago.concept]}</span>
                      <span className={estilos.importe}>
                        {comoImporte(pago.amountCents, pago.currency)}
                      </span>
                    </div>

                    <p className={estilos.detalle}>
                      {comoFecha(`${pago.paidOn}T00:00:00Z`)} · {METODO[pago.method]}
                    </p>

                    {/* Etiqueta Y texto: el estado no depende solo del color. */}
                    {anulado && (
                      <div className={estilos.anulacion}>
                        <Etiqueta tono="neutro">Anulado</Etiqueta>
                        {pago.voidReason && (
                          <span className={estilos.motivo}>{pago.voidReason}</span>
                        )}
                      </div>
                    )}
                  </Tarjeta>
                </li>
              );
            })}
          </ul>

          <Paginacion
            pagina={datos.page}
            tamano={datos.pageSize}
            total={datos.total}
            deshabilitada={cargando}
            alCambiar={setPagina}
          />
        </>
      ) : (
        <Tarjeta>
          <EstadoVacio
            titulo="Todavia no hay pagos"
            /* Sin "paga aqui": no se puede pagar desde GYMLAB. */
            texto="Cuando pagues en tu gimnasio, quedara registrado aqui."
          />
        </Tarjeta>
      )}
    </>
  );
}
