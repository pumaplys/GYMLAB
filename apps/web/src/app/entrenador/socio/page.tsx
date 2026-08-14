'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { AssignedMember } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { Etiqueta } from '@/componentes/etiqueta';
import { MarcoEntrenador } from '@/componentes/marco-entrenador';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from '../entrenador.module.css';

/**
 * La ficha de un socio VISTA POR SU ENTRENADOR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES LA FICHA DEL PANEL CON BOTONES ESCONDIDOS.                         │
 * │                                                                          │
 * │ La del panel es administrativa: editar datos de contrato, dar de baja,   │
 * │ invitar a crear cuenta, cobrar, borrar por el art. 17. Nada de eso es    │
 * │ del entrenador — y el servidor tampoco se lo permitiria.                 │
 * │                                                                          │
 * │ Esta responde otra pregunta: "¿a quien voy a entrenar y como le          │
 * │ localizo?". Por eso se pinta desde cero con los componentes compartidos  │
 * │ en lugar de reutilizar la otra ocultando la mitad, que es como se acaba  │
 * │ con una pantalla que nadie entiende y con permisos escritos en el CSS.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * TODO lo que se pinta viene de `/me/trainer/members/:id`, que responde 404 si
 * ese socio no es suyo. No hay ninguna llamada al listado general de socios.
 */
export default function SocioAsignadoPage() {
  return (
    <RutaPrivada>
      <MarcoEntrenador>
        <Suspense fallback={<Cargando>Abriendo la ficha…</Cargando>}>
          <Ficha />
        </Suspense>
      </MarcoEntrenador>
    </RutaPrivada>
  );
}

function Ficha() {
  const id = useSearchParams().get('id');
  const { gymId, revisar } = useSesion();

  const [socio, setSocio] = useState<AssignedMember | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId || !id) {
      setCargando(false);
      return;
    }

    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.yo
      .miSocio(id, { signal: control.signal })
      .then((suyo) => {
        setSocio(suyo);
        setCargando(false);
      })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return;
        if (esSesionCaducada(problema)) {
          void revisar();
          return;
        }
        /*
         * Un socio que no es suyo llega aqui como 404, igual que uno que no
         * existe. El mensaje es el mismo a proposito: distinguirlos le diria a
         * quien prueba identificadores cuales existen en el gimnasio.
         */
        setError(mensajeDeError(problema));
        setCargando(false);
      });

    return () => control.abort();
  }, [gymId, id, revisar]);

  if (!id) {
    return (
      <>
        <Volver />
        <Aviso>Falta el identificador del socio en la direccion.</Aviso>
      </>
    );
  }

  if (cargando) return <Cargando>Cargando la ficha…</Cargando>;

  if (error || !socio) {
    return (
      <>
        <Volver />
        <Aviso>{error ?? 'Ese socio no esta entre los que tienes asignados.'}</Aviso>
      </>
    );
  }

  return (
    <>
      <Volver />

      <EncabezadoDePagina
        titulo={`${socio.firstName} ${socio.lastName}`}
        junto={
          <>
            <span className={estilos.numero}>N.º {socio.memberNumber}</span>
            <Etiqueta tono={socio.status === 'active' ? 'exito' : 'neutro'}>
              {socio.status === 'active' ? 'Activo' : 'De baja'}
            </Etiqueta>
          </>
        }
      />

      <Tarjeta className={estilos.tarjeta}>
        <dl className={estilos.datos}>
          <dt>Telefono</dt>
          <dd>{socio.phone ?? <span className={estilos.vacio}>Sin telefono</span>}</dd>

          <dt>Correo</dt>
          <dd>{socio.email ?? <span className={estilos.vacio}>Sin correo</span>}</dd>

          {/* Sirve para programar: no es lo mismo entrenar a alguien de 20 que de 70. */}
          <dt>Fecha de nacimiento</dt>
          <dd>
            {socio.birthDate ? (
              comoFecha(`${socio.birthDate}T00:00:00Z`)
            ) : (
              <span className={estilos.vacio}>Sin fecha</span>
            )}
          </dd>

          <dt>Socio desde</dt>
          <dd>{comoFecha(socio.joinedAt)}</dd>

          <dt>Asignado a ti desde</dt>
          <dd>{comoFecha(socio.assignedAt)}</dd>
        </dl>
      </Tarjeta>

      {/*
        Aqui iran su rutina y su progreso, en los PRs siguientes. Hoy no se
        anuncian ni se deja un hueco vacio: un "proximamente" es un enlace
        muerto con otro nombre.
      */}
    </>
  );
}

function Volver() {
  return (
    <Link className={estilos.volver} href="/entrenador">
      ← Volver a mis socios
    </Link>
  );
}
