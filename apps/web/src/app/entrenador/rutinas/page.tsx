'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Routine } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { BotonEnlace } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Dato, FilaApilada, ListaApilada } from '@/componentes/lista-apilada';
import { MarcoEntrenador } from '@/componentes/marco-entrenador';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tabla, celda } from '@/componentes/tabla';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from '../entrenador.module.css';

/**
 * Las rutinas del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SON DEL GIMNASIO, NO DE QUIEN LAS CREO.                                  │
 * │                                                                          │
 * │ `listRoutines` no filtra por autor: cualquier entrenador del gimnasio ve │
 * │ todas. Y tiene sentido — un socio suyo puede estar siguiendo la rutina   │
 * │ de un companero, y no poder abrirla le dejaria sin saber que entrena.    │
 * │                                                                          │
 * │ `created_by_user_id` existe, pero en el servidor solo decide quien puede │
 * │ BORRAR. Como aqui todavia no se borra nada, la pantalla no necesita      │
 * │ saber de quien es cada una — y el contrato tampoco lo expone.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function RutinasPage() {
  return (
    <RutaPrivada>
      <MarcoEntrenador>
        <Rutinas />
      </MarcoEntrenador>
    </RutaPrivada>
  );
}

function Rutinas() {
  const { gymId, revisar } = useSesion();
  const [rutinas, setRutinas] = useState<Routine[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.entrenamiento
      .rutinas(gymId, { signal: control.signal })
      .then((lista) => {
        setRutinas(lista);
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
        titulo="Rutinas"
        entradilla="Las rutinas de este gimnasio. Las ve y las usa cualquier entrenador."
        acciones={
          <BotonEnlace href="/entrenador/rutinas/nueva" variante="primario">
            Nueva rutina
          </BotonEnlace>
        }
      />

      {error && <Aviso>{error}</Aviso>}

      <Tarjeta variante="lista">
        {cargando ? (
          <Cargando>Cargando las rutinas…</Cargando>
        ) : !rutinas || rutinas.length === 0 ? (
          <EstadoVacio
            titulo="Todavia no hay ninguna rutina"
            texto="Crea la primera con «Nueva rutina»: eliges ejercicios de la biblioteca del gimnasio y les pones series y repeticiones."
          />
        ) : (
          <>
            <Tabla filasPulsables conListaEstrecha>
              <thead>
                <tr>
                  <th scope="col">Rutina</th>
                  <th scope="col" className={celda.numerica}>
                    Ejercicios
                  </th>
                  <th scope="col" className={celda.numerica}>
                    Socios
                  </th>
                </tr>
              </thead>
              <tbody>
                {rutinas.map((rutina) => (
                  <tr key={rutina.id}>
                    <td>
                      <Link className={estilos.enlace} href={fichaDe(rutina)}>
                        <span className={estilos.nombreRutina}>{rutina.name}</span>
                      </Link>
                      {rutina.description && (
                        <span className={estilos.descripcion}>{rutina.description}</span>
                      )}
                    </td>
                    <td className={celda.numerica}>{rutina.items.length}</td>
                    <td className={celda.numerica}>{rutina.activeAssignments}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>

            <ListaApilada etiqueta="Rutinas">
              {rutinas.map((rutina) => (
                <FilaApilada
                  key={rutina.id}
                  href={fichaDe(rutina)}
                  titulo={
                    <>
                      {rutina.name}
                      {rutina.description && (
                        <span className={estilos.descripcion}>{rutina.description}</span>
                      )}
                    </>
                  }
                >
                  <Dato etiqueta="Ejercicios">
                    <span className={celda.numerica}>{rutina.items.length}</span>
                  </Dato>
                  <Dato etiqueta="Socios">
                    <span className={celda.numerica}>{rutina.activeAssignments}</span>
                  </Dato>
                </FilaApilada>
              ))}
            </ListaApilada>
          </>
        )}
      </Tarjeta>
    </>
  );
}

/** `?id=` por la exportacion estatica, igual que el resto del proyecto. */
function fichaDe(rutina: Routine): string {
  return `/entrenador/rutinas/ficha?id=${encodeURIComponent(rutina.id)}`;
}
