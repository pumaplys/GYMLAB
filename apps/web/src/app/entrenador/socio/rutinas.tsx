'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AssignedRoutine, Routine } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { ConfirmacionEnLinea } from '@/componentes/confirmacion-en-linea';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { SelectorEnLinea } from '@/componentes/selector-en-linea';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './rutinas.module.css';
import { DESDE_CUANTAS_SE_BUSCA, cuantosEjercicios, elegibles } from './rutinas-logica';

/**
 * Las rutinas de UN socio, dentro de su ficha.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE ASIGNA DESDE LA PERSONA, NO DESDE LA RUTINA.                          │
 * │                                                                          │
 * │ La API expone la asignacion colgando de la rutina                        │
 * │ (`POST /routines/:id/members`), pero eso es forma de la ruta. El         │
 * │ entrenador parte de quien tiene delante y decide que darle, no abre una  │
 * │ rutina para repartirla. Convertir la ficha de rutina en una pantalla     │
 * │ administrativa con "asignar a…" seria copiar la forma del endpoint en la │
 * │ interfaz.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * VARIAS A LA VEZ, y no es un descuido: asignar una segunda NO termina la
 * primera. Un socio puede seguir fuerza y movilidad. Lo unico que el servidor
 * rechaza es la misma rutina dos veces mientras siga vigente.
 */
export function RutinasDelSocio({ memberId, nombre }: { memberId: string; nombre: string }) {
  const { gymId, revisar } = useSesion();

  const [asignadas, setAsignadas] = useState<AssignedRoutine[] | null>(null);
  const [delGimnasio, setDelGimnasio] = useState<Routine[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eligiendo, setEligiendo] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [terminando, setTerminando] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const cargar = useCallback(
    async (signal?: AbortSignal) => {
      if (!gymId) return;
      // Las dos a la vez: son independientes y encadenarlas duplica la espera.
      const [suyas, todas] = await Promise.all([
        api.entrenamiento.rutinasDeSocio(gymId, memberId, { signal }),
        api.entrenamiento.rutinas(gymId, { signal }),
      ]);
      setAsignadas(suyas);
      setDelGimnasio(todas);
    },
    [gymId, memberId],
  );

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    cargar(control.signal)
      .then(() => setCargando(false))
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
  }, [gymId, cargar, revisar]);

  /*
   * El cambio de gimnasio tira el estado local.
   *
   * Sin esto, cambiar de gimnasio con la ficha abierta dejaria en pantalla las
   * rutinas del anterior mientras llega la peticion nueva — y peor, el selector
   * abierto con opciones que el servidor ya rechazaria. `gymId` esta en las
   * dependencias del efecto de arriba, asi que recarga; esto ademas borra lo que
   * quedaba a medias.
   */
  useEffect(() => {
    setEligiendo(false);
    setGuardando(null);
    setTerminando(null);
    setHecho(null);
    setAsignadas(null);
    setDelGimnasio(null);
  }, [gymId]);

  const candidatas = useMemo(
    () => elegibles(delGimnasio ?? [], asignadas ?? []),
    [delGimnasio, asignadas],
  );

  /** Hay rutinas, pero ninguna asignable. Se dice distinto que no tener ninguna. */
  const todasArchivadas = (delGimnasio?.length ?? 0) > 0 && candidatas.length === 0;

  const asignar = async (routineId: string) => {
    if (!gymId || guardando) return;
    setGuardando(routineId);
    setError(null);
    try {
      await api.entrenamiento.asignarRutina(gymId, routineId, memberId);
      await cargar();
      // El selector se cierra solo al terminar bien. Si falla se queda abierto
      // con lo elegido a la vista, que es lo que pedira reintentar.
      setEligiendo(false);
      setHecho(delGimnasio?.find((r) => r.id === routineId)?.name ?? 'La rutina');
    } catch (problema: unknown) {
      if (esSesionCaducada(problema)) {
        void revisar();
        return;
      }
      setError(mensajeDeError(problema));
    } finally {
      setGuardando(null);
    }
  };

  const terminar = async (routineId: string) => {
    if (!gymId) return;
    setGuardando(routineId);
    setError(null);
    try {
      await api.entrenamiento.terminarAsignacion(gymId, routineId, memberId);
      await cargar();
      setTerminando(null);
      setHecho(null);
    } catch (problema: unknown) {
      if (esSesionCaducada(problema)) {
        void revisar();
        return;
      }
      setError(mensajeDeError(problema));
    } finally {
      setGuardando(null);
    }
  };

  return (
    <section aria-labelledby="rutinas-del-socio">
      <div className={estilos.cabecera}>
        <h2 className={estilos.titulo} id="rutinas-del-socio">
          Rutinas
        </h2>
        {!eligiendo && !cargando && delGimnasio !== null && (
          <Boton onClick={() => setEligiendo(true)}>Asignar rutina</Boton>
        )}
      </div>

      {error && <Aviso>{error}</Aviso>}

      {/*
        `role="status"` lo pone `Aviso` para el tono de exito: la asignacion no
        cambia de pantalla, asi que sin anuncio quien no ve la lista no se entera
        de que ha pasado algo.
      */}
      {hecho && (
        <Aviso tono="exito">
          {hecho} asignada a {nombre}. Sigue {asignadas?.length === 1 ? 'esta rutina' : `${asignadas?.length ?? 0} rutinas`}.
        </Aviso>
      )}

      {eligiendo && (
        <div className={estilos.selector}>
          <SelectorEnLinea
            opciones={candidatas.map((c) => ({
              clave: c.rutina.id,
              titulo: c.rutina.name,
              detalle: [cuantosEjercicios(c.rutina), c.rutina.description]
                .filter(Boolean)
                .join(' · '),
              // Se pinta pero no se elige: el servidor responde 400 a la misma
              // rutina dos veces mientras siga vigente.
              motivoBloqueo: c.yaLaSigue ? 'Ya la sigue' : undefined,
            }))}
            etiqueta={`Asignar una rutina a ${nombre}`}
            placeholder="Buscar por nombre o descripcion"
            conBuscador={candidatas.length >= DESDE_CUANTAS_SE_BUSCA}
            /*
              Vacio por archivadas y vacio de verdad no son lo mismo. Si el
              gimnasio tiene rutinas pero todas estan archivadas, decir "no
              tiene rutinas" manda a crear una a quien las esta viendo en la
              otra pantalla.
            */
            tituloVacio={
              todasArchivadas ? 'Todas las rutinas estan archivadas' : 'Este gimnasio no tiene rutinas'
            }
            textoVacio={
              todasArchivadas
                ? 'Una rutina archivada ya no puede asignarse. Crea una nueva en la seccion de rutinas.'
                : 'Crea una en la seccion de rutinas y vuelve aqui.'
            }
            onElegir={(clave) => void asignar(clave)}
            onCancelar={() => setEligiendo(false)}
          />
        </div>
      )}

      <Tarjeta variante="lista">
        {cargando ? (
          <Cargando>Cargando sus rutinas…</Cargando>
        ) : asignadas === null || asignadas.length === 0 ? (
          <EstadoVacio
            titulo="Todavia no sigue ninguna rutina"
            texto={`Asignale una de las del gimnasio y ${nombre} la vera en su aplicacion.`}
          />
        ) : (
          <ul className={estilos.lista}>
            {asignadas.map((rutina) => (
              <li key={rutina.assignmentId} className={estilos.fila}>
                {/*
                  El enlace cubre TODO el bloque de datos, no solo el nombre.
                  Es el patron de "Mis socios" —donde la fila entera es el
                  enlace— y ademas convierte un objetivo de 21 px en uno de
                  sesenta, que es lo que se puede acertar con el pulgar. El boton
                  de quitar se queda fuera: un `<button>` dentro de un `<a>` es
                  HTML invalido.
                */}
                <Link
                  className={estilos.datos}
                  href={`/entrenador/rutinas/ficha?id=${encodeURIComponent(rutina.id)}`}
                >
                  <span className={estilos.nombre}>{rutina.name}</span>
                  <span className={estilos.detalle}>
                    {cuantosEjercicios(rutina)} · Asignada el {comoFecha(rutina.assignedAt)}
                    {/*
                      El socio la sigue igual —archivar no le quita nada—, pero
                      su entrenador tiene que saber que si la quita no va a
                      poder volver a ponersela.
                    */}
                    {rutina.status === 'archived' && ' · Archivada'}
                  </span>
                  {rutina.description && (
                    <span className={estilos.descripcion}>{rutina.description}</span>
                  )}
                </Link>

                {terminando === rutina.id ? (
                  <ConfirmacionEnLinea
                    /*
                      "Dejar de seguirla", no "borrar": la rutina sigue existiendo
                      en el gimnasio y la asignacion se termina, no se borra.
                    */
                    pregunta="¿Dejar de seguirla?"
                    confirmando={guardando === rutina.id}
                    onConfirmar={() => void terminar(rutina.id)}
                    onCancelar={() => setTerminando(null)}
                  />
                ) : (
                  <Boton
                    variante="sutil"
                    tamano="sm"
                    disabled={guardando !== null}
                    onClick={() => setTerminando(rutina.id)}
                  >
                    Quitar<span className="solo-lectores"> {rutina.name}</span>
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </section>
  );
}
