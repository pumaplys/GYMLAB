'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BodyMetric } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { MarcoSocio } from '@/componentes/marco-socio';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { MEDIDAS } from '@/lib/medidas';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './progreso.module.css';

/**
 * Mis mediciones.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PINTA EL HISTORIAL AUNQUE HAYA RETIRADO LA AUTORIZACION.              │
 * │                                                                          │
 * │ El servidor no bloquea la lectura al revocar: solo las escrituras. Y es  │
 * │ deliberado —lo fija #65— porque es justo lo que necesita alguien para    │
 * │ ejercer su derecho de acceso o pedir que se borren sus datos.            │
 * │                                                                          │
 * │ Esconderlo aqui "por prudencia" seria quitarle al socio la vista de sus  │
 * │ propios datos precisamente cuando quiere hacer algo con ellos.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * SOLO LECTURA. El socio no registra sus propias mediciones desde aqui: la API
 * tiene `POST /me/progress`, pero exige consentimiento vigente y el diseño de
 * producto para v1 es que quien mide es el entrenador. No se pone un formulario
 * que no se ha decidido.
 *
 * Y NO SE CALCULA NADA: ni IMC, ni variaciones, ni tendencias. Seria inventar un
 * dato de salud que nadie midio.
 */
export default function MiProgresoPage() {
  return (
    <RutaPrivada>
      <MarcoSocio>
        <MiProgreso />
      </MarcoSocio>
    </RutaPrivada>
  );
}

function MiProgreso() {
  const { gymId, revisar } = useSesion();
  const [mediciones, setMediciones] = useState<BodyMetric[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);
    setMediciones(null);

    api.yo
      .miProgreso({ signal: control.signal })
      .then((suyas) => {
        setMediciones(suyas);
        setCargando(false);
      })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return;
        if (esSesionCaducada(problema)) {
          void revisar();
          return;
        }
        setError(mensajeDeError(problema));
        setCargando(false);
      });

    return () => control.abort();
  }, [gymId, revisar]);

  if (cargando) return <Cargando>Cargando tus mediciones…</Cargando>;

  if (error) {
    return (
      <>
        <EncabezadoDePagina titulo="Tu progreso" />
        <Aviso>{error}</Aviso>
      </>
    );
  }

  return (
    <>
      <EncabezadoDePagina
        titulo="Tu progreso"
        entradilla="Las mediciones que ha registrado tu entrenador, de la mas reciente a la mas antigua."
      />

      {!mediciones || mediciones.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo="Todavia no hay mediciones"
            /*
              Sin formulario ni promesa: el socio no se registra el peso a si
              mismo en v1. Se le dice de donde saldran, y donde decide si quiere
              que existan.
            */
            texto="Cuando tu entrenador te tome el peso o las medidas, apareceran aqui."
          />
        </Tarjeta>
      ) : (
        <ol className={estilos.lista}>
          {mediciones.map((medicion) => (
            <li key={medicion.id}>
              <Medicion medicion={medicion} />
            </li>
          ))}
        </ol>
      )}

      {/*
        Referencia discreta, no una segunda pantalla legal: quien se pregunte por
        que dejaron de tomarle medidas tiene aqui el camino, y la gestion sigue
        estando en un solo sitio.
      */}
      <p className={estilos.pie}>
        Tu decides si tu gimnasio puede registrar estos datos en{' '}
        <Link href="/socio/privacidad">Privacidad</Link>.
      </p>
    </>
  );
}

function Medicion({ medicion }: { medicion: BodyMetric }) {
  // Solo lo que se midio ese dia: una tarjeta con cinco guiones no dice nada.
  const conValor = MEDIDAS.filter((m) => medicion[m.campo] !== null);

  return (
    <Tarjeta className={estilos.medicion}>
      <h2 className={estilos.fecha}>{comoFecha(medicion.measuredAt)}</h2>

      <dl className={estilos.datos}>
        {conValor.map((m) => (
          <div key={m.campo} className={estilos.dato}>
            <dt>{m.etiqueta}</dt>
            <dd className={estilos.valor}>
              {medicion[m.campo]} <span className={estilos.unidad}>{m.unidad}</span>
            </dd>
          </div>
        ))}
      </dl>

      {medicion.notes && <p className={estilos.notas}>{medicion.notes}</p>}
      {/*
        No se pinta `id` ni `consentVersion`: el primero es un identificador
        interno y el segundo es la etiqueta del texto legal bajo el que se
        recogio el dato. Le importa a una autoridad de control, no a quien mira
        cuanto pesaba en julio.
      */}
    </Tarjeta>
  );
}
