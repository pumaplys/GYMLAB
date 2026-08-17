'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OwnAccessEventList } from '@gymlab/contracts';
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
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import { MOTIVO_DE_ACCESO, comoFechaYHora, esAvisoDeSeguridad } from '../historial-logica';
import estilos from './accesos.module.css';

const POR_PAGINA = 25;

/**
 * Mis entradas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO HAY CODIGOS TECNICOS.                                           │
 * │                                                                          │
 * │ `DUES_EXPIRED` no significa nada para quien no ha escrito el sistema. Lo │
 * │ que se pinta es "No pudiste entrar: la cuota estaba vencida", que es la  │
 * │ misma informacion dicha en su idioma.                                    │
 * │                                                                          │
 * │ Los intentos con firma invalida o token caducado NO aparecen: se         │
 * │ registran sin socio porque el token no identifica a nadie de fiar. No    │
 * │ hay ningun filtro que los esconda — es que no pertenecen a su historial. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function MisAccesosPage() {
  return (
    <RutaPrivada>
      <MarcoSocio>
        <MisAccesos />
      </MarcoSocio>
    </RutaPrivada>
  );
}

function MisAccesos() {
  const { gymId, revisar } = useSesion();
  const [datos, setDatos] = useState<OwnAccessEventList | null>(null);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        .misAccesos({ page: pagina, pageSize: POR_PAGINA }, { signal })
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
          // No se borra lo ya cargado: reintentar no deberia costar la pantalla.
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
        titulo="Tus entradas"
        entradilla="Cada vez que has pasado tu codigo por la puerta, de lo mas reciente a lo mas antiguo."
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
        <Cargando>Cargando tus entradas…</Cargando>
      ) : datos && datos.items.length > 0 ? (
        <>
          <ul className={estilos.lista}>
            {datos.items.map((evento, indice) => {
              const paso = evento.decision === 'ALLOW';
              return (
                <li key={`${evento.occurredAt}-${indice}`}>
                  <Tarjeta className={estilos.evento}>
                    <div className={estilos.cabecera}>
                      <span className={estilos.fecha}>{comoFechaYHora(evento.occurredAt)}</span>
                      {/* Etiqueta con texto, no solo color. */}
                      <Etiqueta tono={paso ? 'exito' : 'peligro'}>
                        {paso ? 'Entraste' : 'No entraste'}
                      </Etiqueta>
                    </div>

                    <p className={estilos.motivo}>{MOTIVO_DE_ACCESO[evento.reason]}</p>

                    {/*
                      Un reintento del mismo escaner no es una entrada nueva.
                      Sin decirlo, dos filas al mismo minuto parecerian que
                      alguien uso el codigo dos veces.
                    */}
                    {evento.isRetry && (
                      <p className={estilos.nota}>
                        Se registro dos veces por un fallo de conexion del lector, no es una entrada
                        distinta.
                      </p>
                    )}

                    {esAvisoDeSeguridad(evento) && (
                      <p className={estilos.seguridad}>
                        Si no fuiste tu, genera un codigo nuevo desde tu carne y avisa a tu
                        gimnasio.
                      </p>
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
            titulo="Todavia no hay entradas"
            texto="Cuando pases tu codigo por la puerta, quedara registrado aqui."
          />
        </Tarjeta>
      )}
    </>
  );
}
