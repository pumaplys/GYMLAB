'use client';

import { useEffect, useState } from 'react';
import type { OwnRoutine } from '@gymlab/contracts';
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
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './rutina.module.css';

/**
 * Mi rutina, para mirarla mientras entreno.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES UNA TABLA. ES UNA LISTA DE COSAS QUE HACER.                       │
 * │                                                                          │
 * │ Quien abre esto lo tiene en la mano entre serie y serie, sudando, con    │
 * │ una barra al lado. Una tabla de seis columnas a 320 px obliga a hacer    │
 * │ zoom para leer "4x8-10", y eso es exactamente el momento en que la       │
 * │ aplicacion estorba.                                                      │
 * │                                                                          │
 * │ Por eso cada ejercicio es un bloque numerado con su nombre grande y sus  │
 * │ datos debajo en pares etiqueta/valor. Ocupa mas alto, y da igual: se     │
 * │ recorre con el pulgar.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * SOLO LECTURA. No hay marcar series hechas, ni cronometro, ni editar: nada de
 * eso existe en la API, y un boton que no guarda nada es peor que no tenerlo.
 */
export default function MiRutinaPage() {
  return (
    <RutaPrivada>
      <MarcoSocio>
        <MiRutina />
      </MarcoSocio>
    </RutaPrivada>
  );
}

function MiRutina() {
  const { gymId, revisar } = useSesion();
  const [rutinas, setRutinas] = useState<OwnRoutine[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);
    // Se limpia ANTES de pedir: al cambiar de gimnasio no puede quedar en
    // pantalla la rutina del anterior mientras llega la nueva.
    setRutinas(null);

    api.yo
      .misRutinas({ signal: control.signal })
      .then((suyas) => {
        setRutinas(suyas);
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

  if (cargando) return <Cargando>Cargando tu rutina…</Cargando>;

  if (error) {
    return (
      <>
        <EncabezadoDePagina titulo="Tu rutina" />
        <Aviso>{error}</Aviso>
      </>
    );
  }

  if (!rutinas || rutinas.length === 0) {
    return (
      <>
        <EncabezadoDePagina titulo="Tu rutina" />
        <Tarjeta>
          <EstadoVacio
            titulo="Todavia no tienes rutina"
            /*
              Sin sugerir crear una: el socio no puede, y ofrecerselo seria
              prometer algo que no existe. Se le dice quien si puede.
            */
            texto="Cuando tu entrenador te asigne una, la veras aqui."
          />
        </Tarjeta>
      </>
    );
  }

  return (
    <>
      <EncabezadoDePagina
        titulo={rutinas.length === 1 ? 'Tu rutina' : 'Tus rutinas'}
        /*
          VARIAS A LA VEZ es lo normal, no una excepcion: el modelo lo permite a
          proposito —fuerza y movilidad— y ninguna es "la principal", porque ese
          concepto no existe en el backend. Se listan todas, en el orden en que
          las devuelve el servidor: la mas reciente primero.
        */
        entradilla={
          rutinas.length > 1
            ? `Sigues ${rutinas.length} rutinas. Las mas recientes van primero.`
            : undefined
        }
      />

      {rutinas.map((rutina) => (
        <Rutina key={rutina.assignmentId} rutina={rutina} />
      ))}
    </>
  );
}

function Rutina({ rutina }: { rutina: OwnRoutine }) {
  return (
    <section className={estilos.rutina} aria-labelledby={`rutina-${rutina.assignmentId}`}>
      <div className={estilos.cabecera}>
        <h2 className={estilos.titulo} id={`rutina-${rutina.assignmentId}`}>
          {rutina.name}
        </h2>
        <p className={estilos.meta}>
          {rutina.items.length === 1 ? '1 ejercicio' : `${rutina.items.length} ejercicios`} · Desde
          el {comoFecha(rutina.assignedAt)}
        </p>
        {rutina.description && <p className={estilos.descripcion}>{rutina.description}</p>}
      </div>

      {/*
        `<ol>` y no `<ul>`: el orden ES la rutina. El servidor la entrega ya
        ordenada por `position`, y se numera en pantalla para poder decir "voy
        por el cuatro" sin contar.
      */}
      <ol className={estilos.ejercicios}>
        {rutina.items.map((item, indice) => (
          <li key={item.id}>
            <Tarjeta className={estilos.ejercicio}>
              <div className={estilos.nombreFila}>
                <span className={estilos.posicion} aria-hidden="true">
                  {indice + 1}
                </span>
                {/*
                  Si el gimnasio borro el ejercicio de su biblioteca,
                  `exerciseId` es nulo pero el NOMBRE sobrevive dentro de la
                  rutina. Aqui eso no se nota ni se explica: al socio no le
                  importa el catalogo del gimnasio, le importa que sigue
                  teniendo que hacer press de banca 4x8.
                */}
                <h3 className={estilos.nombre}>{item.exerciseName}</h3>
              </div>

              <dl className={estilos.datos}>
                <div className={estilos.dato}>
                  <dt>Series</dt>
                  <dd className={estilos.numero}>{item.sets}</dd>
                </div>
                <div className={estilos.dato}>
                  <dt>Repeticiones</dt>
                  {/* Texto: "8-10", "al fallo" y "30 s" son prescripciones validas. */}
                  <dd>{item.reps}</dd>
                </div>
                {item.restSeconds !== null && (
                  <div className={estilos.dato}>
                    <dt>Descanso</dt>
                    <dd className={estilos.numero}>{item.restSeconds} s</dd>
                  </div>
                )}
              </dl>

              {item.notes && (
                <p className={estilos.notas}>
                  <span className={estilos.etiquetaNotas}>Nota:</span> {item.notes}
                </p>
              )}
            </Tarjeta>
          </li>
        ))}
      </ol>
    </section>
  );
}
