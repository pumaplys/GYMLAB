'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Routine } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { BotonEnlace } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { Dato, FilaApilada, ListaApilada } from '@/componentes/lista-apilada';
import { MarcoEntrenador } from '@/componentes/marco-entrenador';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tabla, celda } from '@/componentes/tabla';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from '../../entrenador.module.css';

/**
 * Una rutina, en lectura.
 *
 * Se piden los datos por `id` aunque el listado ya los traiga enteros: esta
 * direccion tiene que funcionar al recargar y al compartirla, y depender de un
 * estado que solo existe si vienes de la pantalla anterior la rompe.
 *
 * Editar es otra pantalla y no un modo de esta: el editor tiene su propio
 * estado —items que se anaden, se quitan y se mueven— y mezclarlo con la vista
 * de lectura obliga a que cada fila sepa en cual de los dos mundos vive.
 *
 * La puede editar cualquier entrenador del gimnasio. Lo que solo puede hacer su
 * creador —o el dueno— es borrarla, y eso todavia no esta en ninguna pantalla.
 */
export default function FichaDeRutinaPage() {
  return (
    <RutaPrivada>
      <MarcoEntrenador>
        <Suspense fallback={<Cargando>Abriendo la rutina…</Cargando>}>
          <Ficha />
        </Suspense>
      </MarcoEntrenador>
    </RutaPrivada>
  );
}

function Ficha() {
  const id = useSearchParams().get('id');
  const { gymId, revisar } = useSesion();

  const [rutina, setRutina] = useState<Routine | null>(null);
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

    api.entrenamiento
      .rutina(gymId, id, { signal: control.signal })
      .then((suya) => {
        setRutina(suya);
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
  }, [gymId, id, revisar]);

  if (!id) {
    return (
      <>
        <Volver />
        <Aviso>Falta el identificador de la rutina en la direccion.</Aviso>
      </>
    );
  }

  if (cargando) return <Cargando>Cargando la rutina…</Cargando>;

  if (error || !rutina) {
    return (
      <>
        <Volver />
        <Aviso>{error ?? 'No se ha encontrado esa rutina.'}</Aviso>
      </>
    );
  }

  return (
    <>
      <Volver />

      <EncabezadoDePagina
        titulo={rutina.name}
        entradilla={rutina.description ?? undefined}
        junto={
          <span className={estilos.numero}>
            {rutina.activeAssignments === 1
              ? '1 socio la sigue'
              : `${rutina.activeAssignments} socios la siguen`}
          </span>
        }
        acciones={
          <BotonEnlace href={`/entrenador/rutinas/editar?id=${encodeURIComponent(rutina.id)}`}>
            Editar
          </BotonEnlace>
        }
      />

      <Tarjeta variante="lista" className={estilos.panelRutina}>
        {/*
          El ORDEN es la rutina: `position` viene del servidor y la lista se
          entrega ya ordenada. Se numera en pantalla para que se pueda decir
          "vamos por el cuatro" sin contar.
        */}
        <Tabla conListaEstrecha>
          <thead>
            <tr>
              <th scope="col" className={celda.numerica}>
                #
              </th>
              <th scope="col">Ejercicio</th>
              <th scope="col" className={celda.numerica}>
                Series
              </th>
              <th scope="col">Reps</th>
              <th scope="col" className={celda.numerica}>
                Descanso
              </th>
              <th scope="col">Notas</th>
            </tr>
          </thead>
          <tbody>
            {rutina.items.map((item, indice) => (
              <tr key={item.id}>
                <td className={`${celda.numerica} ${celda.tenue}`}>{indice + 1}</td>
                <td className={estilos.nombreRutina}>
                  {item.exerciseName}
                  {/*
                    `exerciseId` nulo significa que el gimnasio borro el
                    ejercicio de su biblioteca. El nombre sobrevive en la rutina
                    a proposito, asi que se dice en vez de disimularlo: quien la
                    edite manana tiene que saber que ese ya no esta.
                  */}
                  {item.exerciseId === null && (
                    <span className={estilos.descripcion}>Ya no esta en la biblioteca</span>
                  )}
                </td>
                <td className={celda.numerica}>{item.sets}</td>
                <td>{item.reps}</td>
                <td className={celda.numerica}>
                  {item.restSeconds === null ? (
                    <span className={celda.tenue}>—</span>
                  ) : (
                    `${item.restSeconds} s`
                  )}
                </td>
                <td>{item.notes ?? <span className={celda.tenue}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>

        <ListaApilada etiqueta="Ejercicios de la rutina">
          {rutina.items.map((item, indice) => (
            <FilaApilada
              key={item.id}
              titulo={
                <>
                  <span className={estilos.numeroEnTarjeta}>{indice + 1}</span>
                  {item.exerciseName}
                  {item.exerciseId === null && (
                    <span className={estilos.descripcion}>Ya no esta en la biblioteca</span>
                  )}
                </>
              }
            >
              <Dato etiqueta="Series">
                <span className={celda.numerica}>{item.sets}</span>
              </Dato>
              <Dato etiqueta="Reps">{item.reps}</Dato>
              <Dato etiqueta="Descanso">
                {item.restSeconds === null ? '—' : `${item.restSeconds} s`}
              </Dato>
              {item.notes && <Dato etiqueta="Notas">{item.notes}</Dato>}
            </FilaApilada>
          ))}
        </ListaApilada>
      </Tarjeta>
    </>
  );
}

function Volver() {
  return (
    <Link className={estilos.volver} href="/entrenador/rutinas">
      ← Volver a rutinas
    </Link>
  );
}
