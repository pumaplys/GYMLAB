'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MemberTrainer, Trainer } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { ConfirmacionEnLinea } from '@/componentes/confirmacion-en-linea';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Etiqueta } from '@/componentes/etiqueta';
import { SelectorEnLinea } from '@/componentes/selector-en-linea';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './entrenadores.module.css';

/**
 * Quien entrena a este socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VARIOS A LA VEZ, Y NINGUNO ES EL PRINCIPAL.                             │
 * │                                                                          │
 * │ Lo dice el modelo, no esta pantalla: en un gimnasio real alguien hace    │
 * │ fuerza con uno y rehabilitacion con otro. Por eso no hay un desplegable  │
 * │ de "entrenador" sino una lista a la que se anaden y de la que se quitan. │
 * │                                                                          │
 * │ Y por eso NO existe "cambiar de entrenador": seria un borrado mas un     │
 * │ alta fingiendo ser una sola operacion, y si fallara la segunda el socio  │
 * │ se quedaria sin nadie. Se anade uno, se retira otro, cada cosa por su    │
 * │ lado y con su confirmacion.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ESTA CAPACIDAD NO ES ASIGNAR UNA RUTINA. Aqui se decide QUIEN lleva a esta
 * persona; que entrenamiento le pone lo decide despues el entrenador desde su
 * area. Confundirlas es lo que dejo el area de entrenador sin forma de llenar
 * su cartera durante seis entregas.
 */
export function EntrenadoresDelSocio({ memberId }: { memberId: string }) {
  const { gymId, revisar } = useSesion();

  const [asignados, setAsignados] = useState<MemberTrainer[] | null>(null);
  const [plantilla, setPlantilla] = useState<Trainer[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eligiendo, setEligiendo] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const cargar = useCallback(
    async (signal?: AbortSignal) => {
      if (!gymId) return;
      // Las dos a la vez: son independientes y encadenarlas duplica la espera.
      const [suyos, todos] = await Promise.all([
        api.entrenadores.deSocio(gymId, memberId, { signal }),
        api.entrenadores.lista(gymId, { signal }),
      ]);
      setAsignados(suyos);
      setPlantilla(todos);
    },
    [gymId, memberId],
  );

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);
    // El cambio de gimnasio tira la seleccion: un entrenador del gimnasio
    // anterior no existe aqui, y el servidor lo rechazaria.
    setEligiendo(false);
    setRetirando(null);
    setHecho(null);
    setAsignados(null);
    setPlantilla(null);

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

  const asignar = async (trainerId: string) => {
    if (!gymId || trabajando) return;
    setTrabajando(trainerId);
    setError(null);
    try {
      await api.entrenadores.asignar(gymId, trainerId, memberId);
      await cargar();
      // Solo se cierra al ir bien: si falla, el selector sigue abierto con lo
      // elegido a la vista, que es lo que invita a reintentar.
      setEligiendo(false);
      setHecho(plantilla?.find((t) => t.id === trainerId)?.name ?? 'El entrenador');
    } catch (problema: unknown) {
      if (esSesionCaducada(problema)) {
        void revisar();
        return;
      }
      setError(mensajeDeError(problema));
    } finally {
      setTrabajando(null);
    }
  };

  const retirar = async (trainerId: string) => {
    if (!gymId) return;
    setTrabajando(trainerId);
    setError(null);
    try {
      await api.entrenadores.retirar(gymId, trainerId, memberId);
      await cargar();
      setRetirando(null);
      setHecho(null);
    } catch (problema: unknown) {
      if (esSesionCaducada(problema)) {
        void revisar();
        return;
      }
      setError(mensajeDeError(problema));
    } finally {
      setTrabajando(null);
    }
  };

  const yaAsignados = new Set((asignados ?? []).map((a) => a.trainerId));

  return (
    <section className={estilos.seccion} aria-labelledby="entrenadores-del-socio">
      <div className={estilos.cabecera}>
        <h2 className={estilos.titulo} id="entrenadores-del-socio">
          Entrenador
        </h2>
        {!eligiendo && !cargando && plantilla !== null && (
          <Boton onClick={() => setEligiendo(true)}>
            {yaAsignados.size === 0 ? 'Asignar entrenador' : 'Anadir otro'}
          </Boton>
        )}
      </div>

      {error && <Aviso>{error}</Aviso>}
      {hecho && <Aviso tono="exito">{hecho} ya lleva a este socio.</Aviso>}

      {eligiendo && (
        <div className={estilos.selector}>
          <SelectorEnLinea
            opciones={(plantilla ?? []).map((t) => ({
              clave: t.id,
              titulo: t.name,
              detalle:
                t.activeMembers === 1 ? 'Lleva 1 socio' : `Lleva ${t.activeMembers} socios`,
              /*
                Los ya asignados se pintan bloqueados, no escondidos: quien
                busca a alguien y no lo encuentra piensa que la lista esta mal.
                Y quien esta de baja tampoco se oculta — explica por que no
                aparece como opcion.
              */
              motivoBloqueo: yaAsignados.has(t.id)
                ? 'Ya lo lleva'
                : t.status !== 'active'
                  ? 'De baja'
                  : undefined,
            }))}
            etiqueta="Asignar un entrenador a este socio"
            placeholder="Buscar por nombre"
            conBuscador={(plantilla ?? []).length >= 8}
            tituloVacio="Este gimnasio no tiene entrenadores"
            textoVacio="Invita a uno desde Personal y vuelve aqui."
            onElegir={(clave) => void asignar(clave)}
            onCancelar={() => setEligiendo(false)}
          />
        </div>
      )}

      <Tarjeta variante="lista">
        {cargando ? (
          <Cargando>Cargando…</Cargando>
        ) : asignados === null || asignados.length === 0 ? (
          <EstadoVacio
            titulo="Sin entrenador asignado"
            texto="Mientras no tenga uno, nadie podra ponerle rutinas ni registrar su progreso."
          />
        ) : (
          <ul className={estilos.lista}>
            {asignados.map((asignado) => (
              <li key={asignado.assignmentId} className={estilos.fila}>
                <div className={estilos.datos}>
                  <span className={estilos.nombre}>
                    {asignado.name}
                    {/* De baja y con socios asignados es un caso real: se dice. */}
                    {asignado.status !== 'active' && (
                      <Etiqueta tono="neutro">Entrenador de baja</Etiqueta>
                    )}
                  </span>
                  <span className={estilos.desde}>Desde el {comoFecha(asignado.assignedAt)}</span>
                </div>

                {retirando === asignado.trainerId ? (
                  <ConfirmacionEnLinea
                    /* "Retirar", no "borrar": la relacion se termina y se
                       conserva, porque hay rutinas que la necesitan. */
                    pregunta="¿Retirar la asignacion?"
                    confirmando={trabajando === asignado.trainerId}
                    onConfirmar={() => void retirar(asignado.trainerId)}
                    onCancelar={() => setRetirando(null)}
                  />
                ) : (
                  <Boton
                    variante="sutil"
                    tamano="sm"
                    disabled={trabajando !== null}
                    onClick={() => setRetirando(asignado.trainerId)}
                  >
                    Retirar<span className="solo-lectores"> a {asignado.name}</span>
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
