'use client';

import { useEffect, useState } from 'react';
import {
  type DuesState,
  type DuesStatus,
  type PaymentConcept,
  type Payment,
  type Plan,
} from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { Cargando } from '@/componentes/cargando';
import { ConfirmacionEnLinea } from '@/componentes/confirmacion-en-linea';
import { Etiqueta, type TonoDeEtiqueta } from '@/componentes/etiqueta';
import { Dato, FilaApilada, ListaApilada } from '@/componentes/lista-apilada';
import { Selector } from '@/componentes/selector';
import { Tabla, celda } from '@/componentes/tabla';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { aCentimos, comoFecha, comoImporte } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import { accionesDeCuota, sinAcciones } from './acciones-de-cuota';
import estilos from './cuota.module.css';

/**
 * La cuota de un socio: en que estado esta, darle de alta una y cobrarle.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ESTADO SE PREGUNTA, NO SE DEDUCE.                                     │
 * │                                                                          │
 * │ "Al corriente" o "vencida" no son columnas: el servidor los calcula      │
 * │ comparando el fin de periodo con hoy EN LA ZONA DEL GIMNASIO. Esta       │
 * │ pantalla podria restar fechas por su cuenta y acertaria casi siempre —   │
 * │ fallando en las horas en que el navegador y el gimnasio no estan en el   │
 * │ mismo dia, que es justo cuando importa.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * GYMLAB no cobra: aqui solo se registra un cobro que ya ocurrio. Por eso el
 * metodo de pago es informativo y no hay pasarela ninguna.
 */
const NOMBRE_DEL_ESTADO: Record<DuesState, string> = {
  AL_CORRIENTE: 'Al corriente',
  POR_VENCER: 'Vence pronto',
  EN_GRACIA: 'Vencida, dentro de cortesia',
  VENCIDA: 'Vencida',
  PAUSADA: 'Congelada',
  SIN_SUSCRIPCION: 'Sin cuota',
};

/**
 * El tono no es decorativo: es lo que recepcion mira de un vistazo.
 *
 * `Record<DuesState, ...>` obliga a que un estado nuevo del contrato pase por
 * aqui: si se anadiera uno, esto deja de compilar en lugar de pintarlo sin
 * color y sin nombre.
 */
const TONO_DEL_ESTADO: Record<DuesState, TonoDeEtiqueta> = {
  AL_CORRIENTE: 'exito',
  POR_VENCER: 'aviso',
  EN_GRACIA: 'aviso',
  VENCIDA: 'peligro',
  PAUSADA: 'neutro',
  SIN_SUSCRIPCION: 'neutro',
};

const NOMBRE_DEL_CONCEPTO: Record<PaymentConcept, string> = {
  subscription: 'Cuota',
  enrolment: 'Matricula',
  other: 'Otro',
};

const METODOS = [
  ['cash', 'Efectivo'],
  ['card', 'Tarjeta'],
  ['transfer', 'Transferencia'],
  ['other', 'Otro'],
] as const;

export function Cuota({ memberId }: { memberId: string }) {
  const { gymId, rol, revisar: _revisar } = useSesion();

  const [cuota, setCuota] = useState<DuesStatus | null>(null);
  const [pagos, setPagos] = useState<Payment[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  /** Qué acción de ciclo de vida se está confirmando, si alguna. */
  const [confirmando, setConfirmando] = useState<'congelar' | 'reanudar' | 'baja' | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (!gymId) return;

    const control = new AbortController();
    setCargando(true);
    setError(null);

    // Las tres a la vez: son independientes y encadenarlas triplicaria la
    // espera de una pantalla que recepcion abre decenas de veces al dia.
    Promise.all([
      api.billing.dues(gymId, memberId, { signal: control.signal }),
      api.billing.listPayments(gymId, memberId, { signal: control.signal }),
      api.billing.listPlans(gymId, { signal: control.signal }),
    ])
      .then(([estado, historial, catalogo]) => {
        setCuota(estado);
        setPagos(historial);
        setPlanes(catalogo.filter((p) => p.status === 'active'));
        setCargando(false);
      })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return;
        setError(mensajeDeError(problema));
        setCargando(false);
      });

    return () => control.abort();
  }, [gymId, memberId]);

  /** Tras dar de alta una cuota, el estado lo dice el servidor, no se supone. */
  const refrescar = async () => {
    if (!gymId) return;
    const [estado, historial] = await Promise.all([
      api.billing.dues(gymId, memberId),
      api.billing.listPayments(gymId, memberId),
    ]);
    setCuota(estado);
    setPagos(historial);
  };

  /** Solo el historial: el estado ya viene con la respuesta del pago. */
  const refrescarPagos = async () => {
    if (!gymId) return;
    setPagos(await api.billing.listPayments(gymId, memberId));
  };

  /**
   * Congelar, reanudar o dar de baja.
   *
   * Las tres comparten camino porque comparten forma: confirmar, llamar,
   * releer el estado del servidor. El estado resultante NO se deduce aquí —
   * congelar cambia los días guardados y dar de baja deja al socio sin cuota,
   * y eso lo calcula `dues`.
   */
  const ejecutar = async (accion: 'congelar' | 'reanudar' | 'baja') => {
    if (!gymId || trabajando) return;
    setTrabajando(true);
    setError(null);

    try {
      if (accion === 'congelar') await api.billing.pause(gymId, memberId);
      else if (accion === 'reanudar') await api.billing.resume(gymId, memberId);
      else await api.billing.cancel(gymId, memberId);

      setConfirmando(null);
      await refrescar();
    } catch (problema: unknown) {
      // El servidor manda: si rechaza la transición, se enseña su motivo en
      // lugar de dejar la pantalla como si no hubiera pasado nada.
      setError(mensajeDeError(problema));
    } finally {
      setTrabajando(false);
    }
  };

  if (!gymId) return null;

  if (cargando) {
    return (
      <Tarjeta className={estilos.bloque}>
        <Cargando>Cargando la cuota…</Cargando>
      </Tarjeta>
    );
  }

  return (
    <>
      <Tarjeta
        className={estilos.bloque}
        titulo={
          <span className={estilos.titulo}>
            <h2>Cuota</h2>
            {cuota && (
              <Etiqueta tono={TONO_DEL_ESTADO[cuota.estado]}>
                {NOMBRE_DEL_ESTADO[cuota.estado]}
              </Etiqueta>
            )}
          </span>
        }
        acciones={
          cuota &&
          cuota.estado !== 'SIN_SUSCRIPCION' &&
          !cobrando && (
            <span className={estilos.acciones}>
              <Boton onClick={() => setCobrando(true)}>Registrar pago</Boton>
              <AccionesDeCiclo
                estado={cuota.estado}
                confirmando={confirmando}
                trabajando={trabajando}
                onElegir={setConfirmando}
                onConfirmar={ejecutar}
              />
            </span>
          )
        }
      >
        {error && <Aviso>{error}</Aviso>}

        {cuota?.estado === 'SIN_SUSCRIPCION' ? (
          <AltaDeCuota
            gymId={gymId}
            memberId={memberId}
            planes={planes}
            onAlta={() => void refrescar()}
          />
        ) : (
          cuota && <Resumen cuota={cuota} />
        )}

        {cobrando && (
          <FormularioDePago
            gymId={gymId}
            memberId={memberId}
            onCobrado={(estado) => {
              setCobrando(false);
              // El estado viene EN LA RESPUESTA del pago, ya recalculado por el
              // servidor. Se usa tal cual: volver a preguntarlo seria un viaje
              // de mas para obtener lo mismo.
              setCuota(estado);
              void refrescarPagos();
            }}
            onCancelar={() => setCobrando(false)}
          />
        )}
      </Tarjeta>

      {/*
        Los pagos pasan a su propia tarjeta, y no a un subtitulo dentro de la de
        la cuota. Son dos cosas distintas —en que estado esta hoy, y que se ha
        cobrado desde siempre— y compartian superficie solo porque la cabecera
        de tarjeta no existia todavia. Ademas, la tabla necesita ir sin relleno
        y el resto del bloque con el, que en una sola tarjeta obligaba a que
        esta pantalla se pintara sus propios margenes.
      */}
      <Tarjeta variante="lista" className={estilos.bloque} titulo={<h2>Pagos</h2>}>
        <Pagos
          pagos={pagos}
          gymId={gymId}
          puedeAnular={rol === 'owner'}
          onAnulado={refrescar}
        />
      </Tarjeta>
    </>
  );
}

function Resumen({ cuota }: { cuota: DuesStatus }) {
  return (
    <dl className={estilos.resumen}>
      <dt>Plan</dt>
      <dd>{cuota.planName ?? '—'}</dd>

      <dt>Cubierta hasta</dt>
      <dd>{cuota.hasta ? comoFecha(`${cuota.hasta}T00:00:00Z`) : '—'}</dd>

      {cuota.diasRestantes !== null && (
        <>
          <dt>{cuota.diasRestantes < 0 ? 'Vencida desde hace' : 'Le quedan'}</dt>
          <dd>{Math.abs(cuota.diasRestantes)} dias</dd>
        </>
      )}

      <dt>Acceso hoy</dt>
      <dd>{cuota.puedeAcceder ? 'Puede entrar' : 'No puede entrar'}</dd>
    </dl>
  );
}

/** Sin cuota: se elige plan y se le da de alta. */
function AltaDeCuota({
  gymId,
  memberId,
  planes,
  onAlta,
}: {
  gymId: string;
  memberId: string;
  planes: Plan[];
  onAlta: () => void;
}) {
  const [planId, setPlanId] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (planes.length === 0) {
    return (
      <p className={estilos.sinCuota}>
        Este socio no tiene cuota, y el gimnasio todavia no tiene ningun plan activo. Los planes los
        crea el propietario.
      </p>
    );
  }

  const darDeAlta = () => {
    if (!planId || trabajando) return;
    setTrabajando(true);
    setError(null);
    void api.billing
      .subscribe(gymId, memberId, { planId })
      .then(onAlta)
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => setTrabajando(false));
  };

  return (
    <>
      <p className={estilos.sinCuota}>
        Este socio no tiene cuota. Al darle de alta una, <strong>nace vencida</strong>: el periodo
        empieza a contar con el primer pago.
      </p>

      {error && <Aviso>{error}</Aviso>}

      <div className={estilos.alta}>
        <Selector
          etiqueta="Plan"
          valor={planId}
          alCambiar={setPlanId}
          className={estilos.selector}
        >
          <option value="">Elige un plan</option>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} — {comoImporte(plan.priceCents, plan.currency)}
            </option>
          ))}
        </Selector>

        <Boton variante="primario" cargando={trabajando} disabled={!planId} onClick={darDeAlta}>
          Dar de alta la cuota
        </Boton>
      </div>
    </>
  );
}

function FormularioDePago({
  gymId,
  memberId,
  onCobrado,
  onCancelar,
}: {
  gymId: string;
  memberId: string;
  onCobrado: (estado: DuesStatus) => void;
  onCancelar: () => void;
}) {

  const [concepto, setConcepto] = useState<PaymentConcept>('subscription');
  const [importe, setImporte] = useState('');
  const [metodo, setMetodo] = useState<(typeof METODOS)[number][0]>('cash');
  const [nota, setNota] = useState('');
  const [errorImporte, setErrorImporte] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const enviar = () => {
    if (guardando) return;
    setError(null);

    const centimos = aCentimos(importe);
    if (centimos === null) {
      setErrorImporte('Escribe un importe como 30 o 29,95');
      return;
    }
    setErrorImporte(undefined);

    setGuardando(true);
    void api.billing
      .registerPayment(gymId, memberId, {
        concept: concepto,
        amountCents: centimos,
        method: metodo,
        ...(nota.trim() ? { note: nota.trim() } : {}),
      })
      .then((resultado) => onCobrado(resultado.dues))
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => setGuardando(false));
  };

  return (
    <form
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        enviar();
      }}
    >
      {error && <Aviso>{error}</Aviso>}

      <div className={estilos.pareja}>
        <Selector
          etiqueta="Concepto"
          valor={concepto}
          alCambiar={(valor) => setConcepto(valor as PaymentConcept)}
        >
          <option value="subscription">Cuota</option>
          <option value="enrolment">Matricula</option>
          <option value="other">Otro</option>
        </Selector>

        <Selector
          etiqueta="Metodo"
          valor={metodo}
          alCambiar={(valor) => setMetodo(valor as (typeof METODOS)[number][0])}
        >
          {METODOS.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Selector>
      </div>

      <Campo
        etiqueta="Importe cobrado"
        foco
        ayuda="En euros. Solo la matricula y los conceptos sueltos son libres: una cuota suele ser el precio del plan."
        valor={importe}
        error={errorImporte}
        alCambiar={setImporte}
      />

      <Campo etiqueta="Nota" opcional valor={nota} alCambiar={setNota} />

      <div className={estilos.pie}>
        <Boton type="submit" variante="primario" cargando={guardando}>
          Registrar el pago
        </Boton>
        <Boton onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/**
 * El historial, con los anulados incluidos.
 *
 * La tabla de pagos es append-only: anular no borra, marca. Esconder los
 * anulados aqui haria que el historial no cuadrara con la contabilidad del
 * gimnasio, que es justo para lo que se mira.
 */
function Pagos({
  pagos,
  gymId,
  puedeAnular,
  onAnulado,
}: {
  pagos: Payment[];
  gymId: string;
  /** Solo el dueno anula. El servidor lo impone; aqui no se ofrece. */
  puedeAnular: boolean;
  onAnulado: () => Promise<void>;
}) {
  const [anulando, setAnulando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pagos.length === 0) {
    return <p className={estilos.vacio}>Todavia no hay ningun pago registrado.</p>;
  }

  /*
   * Un pago ya anulado NO vuelve a ofrecer la accion: el servidor responde
   * «Ese pago ya esta anulado» y ensenar el boton solo invita a ese error.
   */
  const anulable = (pago: Payment) => puedeAnular && !pago.voidedAt;

  return (
    <>
      {error && <Aviso>{error}</Aviso>}

      <Tabla conListaEstrecha>
        <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Concepto</th>
          <th scope="col">Metodo</th>
          <th scope="col" className={celda.numerica}>
            Importe
          </th>
          {puedeAnular && <th scope="col" />}
        </tr>
      </thead>
      <tbody>
        {pagos.map((pago) => (
          <tr key={pago.id}>
            <td>{comoFecha(`${pago.paidOn}T00:00:00Z`)}</td>
            <td>{NOMBRE_DEL_CONCEPTO[pago.concept]}</td>
            <td>{METODOS.find(([valor]) => valor === pago.method)?.[1] ?? pago.method}</td>
            <td className={`${celda.numerica} ${pago.voidedAt ? estilos.anulado : ''}`}>
              {comoImporte(pago.amountCents, pago.currency)}
              {pago.voidedAt && <span className={estilos.motivo}>Anulado: {pago.voidReason}</span>}
            </td>
            {puedeAnular && (
              <td className={celda.acciones}>
                {anulable(pago) && (
                  <Boton variante="sutil" onClick={() => setAnulando(pago.id)}>
                    Anular
                  </Boton>
                )}
              </td>
            )}
          </tr>
        ))}
        </tbody>
      </Tabla>

      {anulando && (
        <FormularioDeAnulacion
          gymId={gymId}
          paymentId={anulando}
          onCancelar={() => setAnulando(null)}
          onAnulado={async () => {
            setAnulando(null);
            setError(null);
            await onAnulado();
          }}
          onError={setError}
        />
      )}

      {/*
        En estrecho, el importe sube al titulo de la tarjeta junto al concepto:
        es lo que se busca al abrir el historial —cuanto y de que— y ponerlo
        como un par mas obligaria a leer las cuatro lineas para encontrarlo.

        Un pago anulado sigue en la lista, tachado y con su motivo: el historial
        tiene que cuadrar con la contabilidad del gimnasio.
      */}
      <ListaApilada etiqueta="Pagos">
        {pagos.map((pago) => (
          <FilaApilada
            key={pago.id}
            titulo={
              <span className={estilos.conceptoEnTarjeta}>
                {NOMBRE_DEL_CONCEPTO[pago.concept]}
                <span className={`${celda.numerica} ${pago.voidedAt ? estilos.anulado : ''}`}>
                  {comoImporte(pago.amountCents, pago.currency)}
                </span>
              </span>
            }
          >
            <Dato etiqueta="Fecha">{comoFecha(`${pago.paidOn}T00:00:00Z`)}</Dato>
            <Dato etiqueta="Metodo">
              {METODOS.find(([valor]) => valor === pago.method)?.[1] ?? pago.method}
            </Dato>
            {pago.voidedAt && <Dato etiqueta="Anulado">{pago.voidReason}</Dato>}
          </FilaApilada>
        ))}
      </ListaApilada>
    </>
  );
}

/**
 * Congelar, reanudar y dar de baja.
 *
 * Solo aparece lo que el estado permite: `acciones-de-cuota` copia las reglas
 * del servidor para no ofrecer un boton que va a fallar seguro. Si aun asi el
 * servidor rechazara la transicion, su mensaje se pinta arriba.
 *
 * Confirmacion EN LINEA y no modal, como el resto del panel: dar de baja una
 * cuota deja al socio sin poder entrar, y congelar mueve el vencimiento.
 */
function AccionesDeCiclo({
  estado,
  confirmando,
  trabajando,
  onElegir,
  onConfirmar,
}: {
  estado: DuesState;
  confirmando: 'congelar' | 'reanudar' | 'baja' | null;
  trabajando: boolean;
  onElegir: (accion: 'congelar' | 'reanudar' | 'baja' | null) => void;
  onConfirmar: (accion: 'congelar' | 'reanudar' | 'baja') => void;
}) {
  const puede = accionesDeCuota(estado);
  if (sinAcciones(estado)) return null;

  if (confirmando) {
    return (
      <ConfirmacionEnLinea
        pregunta={PREGUNTA[confirmando]}
        confirmando={trabajando}
        onConfirmar={() => onConfirmar(confirmando)}
        onCancelar={() => onElegir(null)}
      />
    );
  }

  return (
    <>
      {puede.congelar && (
        <Boton variante="sutil" onClick={() => onElegir('congelar')}>
          Congelar
        </Boton>
      )}
      {puede.reanudar && (
        <Boton variante="sutil" onClick={() => onElegir('reanudar')}>
          Reanudar
        </Boton>
      )}
      {puede.darDeBaja && (
        <Boton variante="sutil" onClick={() => onElegir('baja')}>
          Dar de baja
        </Boton>
      )}
    </>
  );
}

const PREGUNTA: Record<'congelar' | 'reanudar' | 'baja', string> = {
  // Se dice lo que PASA, no solo lo que se pulsa: los dias guardados y la
  // perdida de acceso son justo lo que alguien necesita saber antes de decidir.
  congelar: '¿Congelar la cuota? Los dias que queden se guardan para despues.',
  reanudar: '¿Reanudar la cuota? Se recuperan los dias guardados.',
  baja: '¿Dar de baja la cuota? Dejara de poder entrar hasta que se le de otra.',
};

/**
 * Anular un cobro. Pide el motivo porque el servidor lo exige.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ANULAR NO BORRA, Y LA PANTALLA TIENE QUE DECIRLO.                       │
 * │                                                                          │
 * │ La tabla de pagos es append-only: la fila se queda, tachada y con este   │
 * │ motivo al lado. Quien anula un cobro suele esperar que desaparezca, y si │
 * │ nadie se lo advierte se queda pensando que no funciono.                  │
 * │                                                                          │
 * │ Y el motivo no es burocracia: seis meses despues, «anulado» sin explicar │
 * │ por que es un descuadre que nadie puede justificar.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function FormularioDeAnulacion({
  gymId,
  paymentId,
  onCancelar,
  onAnulado,
  onError,
}: {
  gymId: string;
  paymentId: string;
  onCancelar: () => void;
  onAnulado: () => Promise<void>;
  onError: (mensaje: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  return (
    <form
      className={estilos.anulacion}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (guardando) return;
        setGuardando(true);
        void api.billing
          .voidPayment(gymId, paymentId, motivo.trim())
          .then(onAnulado)
          .catch((problema: unknown) => onError(mensajeDeError(problema)))
          .finally(() => setGuardando(false));
      }}
    >
      <Campo
        etiqueta="Motivo de la anulacion"
        ayuda="El pago no se borra: queda tachado en el historial con este motivo."
        valor={motivo}
        alCambiar={setMotivo}
        deshabilitado={guardando}
        foco
      />
      <div className={estilos.acciones}>
        {/* Minimo tres caracteres, como el contrato del servidor. */}
        <Boton
          type="submit"
          variante="peligro"
          cargando={guardando}
          disabled={motivo.trim().length < 3}
        >
          Anular el pago
        </Boton>
        <Boton onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
