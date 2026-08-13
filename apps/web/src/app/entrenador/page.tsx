'use client';

import { useEffect, useState } from 'react';
import type { Trainer } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { MarcoEntrenador } from '@/componentes/marco-entrenador';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './entrenador.module.css';

/**
 * La portada del area de entrenador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES UN CIMIENTO, NO UNA PANTALLA DE PRODUCTO.                             │
 * │                                                                          │
 * │ Existe para demostrar tres cosas del bloque de infraestructura, y solo   │
 * │ esas: que el enrutado por area funciona, que el marco propio se pinta, y │
 * │ que el contexto del rol se puede pedir a la API sin pasar ningun         │
 * │ identificador — `/me/trainer` resuelve por la sesion.                    │
 * │                                                                          │
 * │ Sus socios, las rutinas, los ejercicios y el progreso llegan en PRs      │
 * │ posteriores. Hasta entonces no se anuncian ni se enlazan.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `RutaPrivada` deduce de la ruta que esto es del area de entrenador: quien
 * tenga otro rol en su gimnasio activo acaba en la suya, no aqui.
 */
export default function EntrenadorPage() {
  return (
    <RutaPrivada>
      <MarcoEntrenador>
        <Inicio />
      </MarcoEntrenador>
    </RutaPrivada>
  );
}

function Inicio() {
  const { gymId, revisar } = useSesion();
  const [perfil, setPerfil] = useState<Trainer | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Depende de `gymId`: al cambiar de gimnasio hay que volver a preguntar, o se
  // quedaria en pantalla el perfil del anterior.
  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.yo
      .perfilDeEntrenador({ signal: control.signal })
      .then((suyo) => {
        setPerfil(suyo);
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

  return (
    <>
      <EncabezadoDePagina
        titulo="Entrenador"
        entradilla="Tu area de trabajo. Todavia no tiene pantallas: llegan en las siguientes entregas."
      />

      {error && <Aviso>{error}</Aviso>}

      <Tarjeta className={estilos.tarjeta}>
        {cargando ? (
          <Cargando>Cargando tu perfil…</Cargando>
        ) : (
          perfil && (
            <dl className={estilos.datos}>
              <dt>Nombre</dt>
              <dd>{perfil.name}</dd>

              <dt>Correo</dt>
              <dd>{perfil.email}</dd>

              <dt>Socios asignados</dt>
              <dd>{perfil.activeMembers}</dd>
            </dl>
          )
        )}
      </Tarjeta>
    </>
  );
}
