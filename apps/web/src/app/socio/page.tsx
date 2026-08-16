'use client';

import { useEffect, useState } from 'react';
import type { DuesStatus, Member } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { BotonEnlace } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { Etiqueta } from '@/componentes/etiqueta';
import { MarcoSocio } from '@/componentes/marco-socio';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import { diasEnPalabras, lecturaDe } from './cuota-logica';
import estilos from './socio.module.css';

/**
 * El inicio del socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RESPONDE UNA PREGUNTA, NO ENSENA UN PANEL.                              │
 * │                                                                          │
 * │ Quien abre esto lo hace con una mano, en la puerta, para saber si puede  │
 * │ entrenar. Por eso la cuota va ARRIBA y grande, y sus datos personales    │
 * │ debajo: nadie abre el movil para comprobar su propio numero de socio.    │
 * │                                                                          │
 * │ Y por eso no hay tarjetas de adorno. Todo lo que se pinta sale de un     │
 * │ contrato real: `/me/member-profile` y `/me/dues`, las dos sin ningun     │
 * │ identificador en la ruta.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function SocioPage() {
  return (
    <RutaPrivada>
      <MarcoSocio>
        <Inicio />
      </MarcoSocio>
    </RutaPrivada>
  );
}

function Inicio() {
  const { gymId, revisar, estado } = useSesion();
  const [ficha, setFicha] = useState<Member | null>(null);
  const [cuota, setCuota] = useState<DuesStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);
    /*
     * Se limpia ANTES de pedir, no despues de recibir.
     *
     * Sin esto, cambiar de gimnasio deja en pantalla la cuota del anterior
     * mientras llega la nueva: unos segundos en los que el socio lee "al
     * corriente" sobre un gimnasio en el que quiza no lo esta.
     */
    setFicha(null);
    setCuota(null);

    // Las dos a la vez: son independientes y encadenarlas duplica la espera.
    Promise.all([
      api.yo.fichaDeSocio({ signal: control.signal }),
      api.yo.miCuota({ signal: control.signal }),
    ])
      .then(([mia, suCuota]) => {
        setFicha(mia);
        setCuota(suCuota);
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

  // El nombre del gimnasio sale de la sesion, que ya lo trae: pedirlo otra vez
  // seria una peticion mas para un dato que ya esta en memoria.
  const gimnasio =
    estado.fase === 'identificado'
      ? estado.yo.memberships.find((m) => m.gymId === gymId)?.gymName
      : undefined;

  if (cargando) return <Cargando>Cargando tus datos…</Cargando>;

  if (error || !ficha) {
    return (
      <>
        <EncabezadoDePagina titulo="Tu cuenta" />
        <Aviso>{error ?? 'No hemos podido cargar tus datos.'}</Aviso>
      </>
    );
  }

  return (
    <>
      <EncabezadoDePagina
        titulo={`Hola, ${ficha.firstName}`}
        // En que gimnasio esta, que es la primera pregunta de quien pertenece a
        // dos. Sale de la sesion, no de una peticion mas.
        entradilla={gimnasio ? `Tu cuenta en ${gimnasio}.` : undefined}
      />

      {/*
        La ficha dada de baja se dice antes que nada: explica por que la cuota
        puede estar rara y no es algo que el socio pueda arreglar desde aqui.
      */}
      {ficha.status !== 'active' && (
        <Aviso tono="informacion">
          Tu ficha figura de baja en este gimnasio. Si crees que es un error, habla con ellos.
        </Aviso>
      )}

      {cuota && <Cuota cuota={cuota} />}

      <Tarjeta className={estilos.tarjeta}>
        <h2 className={estilos.titulo}>Tus datos</h2>
        <dl className={estilos.datos}>
          <dt>Nombre</dt>
          <dd>
            {ficha.firstName} {ficha.lastName}
          </dd>

          <dt>N.º de socio</dt>
          <dd className={estilos.numero}>{ficha.memberNumber}</dd>

          <dt>Correo</dt>
          <dd>{ficha.email ?? <span className={estilos.vacio}>Sin correo</span>}</dd>

          <dt>Telefono</dt>
          <dd>{ficha.phone ?? <span className={estilos.vacio}>Sin telefono</span>}</dd>

          <dt>Socio desde</dt>
          <dd>{comoFecha(ficha.joinedAt)}</dd>
        </dl>
        {/*
          Sin boton de editar: no existe autoservicio de perfil en la API para el
          socio, y ofrecerlo seria prometer algo que no se puede cumplir.
        */}
        <p className={estilos.pista}>
          Para cambiar tus datos de contacto, dilo en tu gimnasio.
        </p>
      </Tarjeta>

      <Tarjeta className={estilos.tarjeta}>
        <h2 className={estilos.titulo}>Tus datos de salud</h2>
        <p className={estilos.pista}>
          Decide si tu gimnasio puede registrar tu peso y tus medidas.
        </p>
        <BotonEnlace href="/socio/privacidad">Ver y decidir</BotonEnlace>
      </Tarjeta>
    </>
  );
}

/**
 * El estado de la cuota, que es a lo que se abre esta pantalla.
 *
 * El tono de color acompaña al texto pero no lo sustituye: "Vencida" se lee
 * igual en gris, y quien no distingue rojo de verde tiene que poder saberlo.
 */
function Cuota({ cuota }: { cuota: DuesStatus }) {
  const lectura = lecturaDe(cuota);
  const dias = diasEnPalabras(cuota);

  return (
    <Tarjeta className={estilos.tarjeta}>
      <div className={estilos.cabeceraCuota}>
        <h2 className={estilos.titulo}>Tu cuota</h2>
        <Etiqueta
          tono={
            lectura.tono === 'exito' ? 'exito' : lectura.tono === 'peligro' ? 'peligro' : 'neutro'
          }
        >
          {lectura.titulo}
        </Etiqueta>
      </div>

      <p className={estilos.explicacion}>{lectura.explicacion}</p>

      {/* Solo lo que el contrato trae de verdad. No hay importe en `DuesStatus`. */}
      {(cuota.planName || cuota.hasta) && (
        <dl className={estilos.datos}>
          {cuota.planName && (
            <>
              <dt>Plan</dt>
              <dd>{cuota.planName}</dd>
            </>
          )}
          {cuota.hasta && (
            <>
              <dt>Hasta</dt>
              <dd>
                {comoFecha(`${cuota.hasta}T00:00:00Z`)}
                {dias && <span className={estilos.dias}> · {dias}</span>}
              </dd>
            </>
          )}
        </dl>
      )}
    </Tarjeta>
  );
}
