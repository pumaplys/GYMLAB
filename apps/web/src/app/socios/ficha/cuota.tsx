'use client';

import { useEffect, useId, useState } from 'react';
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
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { aCentimos, comoFecha, comoImporte } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
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
const TONO_DEL_ESTADO: Record<DuesState, string | undefined> = {
  AL_CORRIENTE: estilos.alCorriente,
  POR_VENCER: estilos.aviso,
  EN_GRACIA: estilos.aviso,
  VENCIDA: estilos.vencida,
  PAUSADA: estilos.neutro,
  SIN_SUSCRIPCION: estilos.neutro,
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
  const { gymId, revisar: _revisar } = useSesion();

  const [cuota, setCuota] = useState<DuesStatus | null>(null);
  const [pagos, setPagos] = useState<Payment[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

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

  if (!gymId) return null;

  if (cargando) {
    return (
      <div className={estilos.bloque}>
        <p className={estilos.vacio} role="status">
          Cargando la cuota…
        </p>
      </div>
    );
  }

  return (
    <section className={estilos.bloque} aria-label="Cuota">
      <div className={estilos.cabecera}>
        <div className={estilos.titulo}>
          <h2>Cuota</h2>
          {cuota && (
            <span className={`${estilos.etiqueta} ${TONO_DEL_ESTADO[cuota.estado]}`}>
              {NOMBRE_DEL_ESTADO[cuota.estado]}
            </span>
          )}
        </div>

        {cuota && cuota.estado !== 'SIN_SUSCRIPCION' && !cobrando && (
          <Boton onClick={() => setCobrando(true)}>Registrar pago</Boton>
        )}
      </div>

      <div className={estilos.cuerpo}>
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
      </div>

      <p className={estilos.subtitulo}>Pagos</p>
      <Pagos pagos={pagos} />
    </section>
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
  const id = useId();
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
        <div className={estilos.campoSelector}>
          <label className={estilos.etiquetaCampo} htmlFor={id}>
            Plan
          </label>
          <select
            id={id}
            className={estilos.selector}
            value={planId}
            onChange={(evento) => setPlanId(evento.target.value)}
          >
            <option value="">Elige un plan</option>
            {planes.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {comoImporte(plan.priceCents, plan.currency)}
              </option>
            ))}
          </select>
        </div>

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
  const idConcepto = useId();
  const idMetodo = useId();

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
        <div className={estilos.campoSelector}>
          <label className={estilos.etiquetaCampo} htmlFor={idConcepto}>
            Concepto
          </label>
          <select
            id={idConcepto}
            className={estilos.selector}
            value={concepto}
            onChange={(evento) => setConcepto(evento.target.value as PaymentConcept)}
          >
            <option value="subscription">Cuota</option>
            <option value="enrolment">Matricula</option>
            <option value="other">Otro</option>
          </select>
        </div>

        <div className={estilos.campoSelector}>
          <label className={estilos.etiquetaCampo} htmlFor={idMetodo}>
            Metodo
          </label>
          <select
            id={idMetodo}
            className={estilos.selector}
            value={metodo}
            onChange={(evento) => setMetodo(evento.target.value as (typeof METODOS)[number][0])}
          >
            {METODOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
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
function Pagos({ pagos }: { pagos: Payment[] }) {
  if (pagos.length === 0) {
    return <p className={estilos.vacio}>Todavia no hay ningun pago registrado.</p>;
  }

  return (
    <table className={estilos.pagos}>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Concepto</th>
          <th scope="col">Metodo</th>
          <th scope="col">Importe</th>
        </tr>
      </thead>
      <tbody>
        {pagos.map((pago) => (
          <tr key={pago.id}>
            <td>{comoFecha(`${pago.paidOn}T00:00:00Z`)}</td>
            <td>{NOMBRE_DEL_CONCEPTO[pago.concept]}</td>
            <td>{METODOS.find(([valor]) => valor === pago.method)?.[1] ?? pago.method}</td>
            <td className={`${estilos.importe} ${pago.voidedAt ? estilos.anulado : ''}`}>
              {comoImporte(pago.amountCents, pago.currency)}
              {pago.voidedAt && <span className={estilos.motivo}>Anulado: {pago.voidReason}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
