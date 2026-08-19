'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Etiqueta } from '@/componentes/etiqueta';
import { Dato, FilaApilada, ListaApilada } from '@/componentes/lista-apilada';
import { MarcoEntrenador } from '@/componentes/marco-entrenador';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tabla, celda } from '@/componentes/tabla';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { NOMBRE_DEL_GRUPO, filtrarEjercicios } from '@/lib/ejercicios';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import { ConfirmacionEnLinea } from '@/componentes/confirmacion-en-linea';
import { Boton } from '@/componentes/boton';
import { FormularioDeEjercicio } from './formulario';
import estilos from '../entrenador.module.css';

/**
 * La biblioteca de ejercicios del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO HAY EJERCICIOS "GLOBALES", Y CONVIENE NO CONFUNDIRSE.                 │
 * │                                                                          │
 * │ Cada fila de `exercises` pertenece a UN gimnasio. Al darse de alta, la   │
 * │ biblioteca nace COPIADA de la plantilla de plataforma (ADR-0012) y a     │
 * │ partir de ahi es suya: puede editarla y borrarla sin que eso afecte a    │
 * │ nadie mas.                                                               │
 * │                                                                          │
 * │ `fromTemplate` no dice "es global": dice de donde vino esta copia. Se    │
 * │ pinta porque distingue el fondo de catalogo de lo que el gimnasio ha     │
 * │ anadido por su cuenta, que es informacion util al escribir una rutina.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Dueno y entrenador pueden crear, editar y borrar: es su biblioteca. Borrar
 * uno NO rompe las rutinas que lo usaban —la clave ajena es `SET NULL`— pero
 * si las deja senaladas, y por eso se confirma antes.
 */
export default function EjerciciosPage() {
  return (
    <RutaPrivada>
      <MarcoEntrenador>
        <Biblioteca />
      </MarcoEntrenador>
    </RutaPrivada>
  );
}

function Biblioteca() {
  const { gymId, revisar } = useSesion();
  const [ejercicios, setEjercicios] = useState<Exercise[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  /** `null` = nada abierto; `'nuevo'` = alta; un Exercise = edicion. */
  const [editando, setEditando] = useState<Exercise | 'nuevo' | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.entrenamiento
      .ejercicios(gymId, { signal: control.signal })
      .then((lista) => {
        setEjercicios(lista);
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

  /** Relee la biblioteca del servidor. El resultado no se deduce en local. */
  const recargar = async () => {
    if (!gymId) return;
    setEjercicios(await api.entrenamiento.ejercicios(gymId));
  };

  const borrar = async (id: string) => {
    if (!gymId) return;
    try {
      setError(null);
      await api.entrenamiento.eliminarEjercicio(gymId, id);
      setBorrando(null);
      await recargar();
    } catch (problema: unknown) {
      setError(mensajeDeError(problema));
    }
  };

  /*
   * Busqueda local, y aqui si esta justificada por el tamano.
   *
   * La plantilla siembra mas de sesenta ejercicios, asi que la lista es larga
   * de recorrer — pero el endpoint la devuelve entera de una vez y no admite
   * filtro. El mismo filtro que usa el selector del editor de rutinas: se busca
   * igual en los dos sitios porque es la misma biblioteca.
   */
  const visibles = useMemo(
    () => filtrarEjercicios(ejercicios ?? [], busqueda),
    [ejercicios, busqueda],
  );

  const buscando = busqueda.trim() !== '';

  return (
    <>
      <EncabezadoDePagina
        acciones={
          !editando && <Boton onClick={() => setEditando('nuevo')}>Nuevo ejercicio</Boton>
        }
        titulo="Ejercicios"
        entradilla="La biblioteca de este gimnasio. Es suya: nace del catalogo de GYMLAB y el gimnasio la ajusta."
      />

      {error && <Aviso>{error}</Aviso>}

      {editando && gymId && (
        <FormularioDeEjercicio
          gymId={gymId}
          ejercicio={editando === 'nuevo' ? null : editando}
          onGuardado={async () => {
            setEditando(null);
            await recargar();
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {ejercicios && ejercicios.length > 0 && (
        <div className={estilos.herramientas}>
          <label className="solo-lectores" htmlFor="buscar-ejercicio">
            Buscar ejercicios
          </label>
          <input
            id="buscar-ejercicio"
            type="search"
            className={estilos.buscador}
            placeholder="Buscar por nombre, material o grupo"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>
      )}

      <Tarjeta variante="lista">
        {cargando ? (
          <Cargando>Cargando la biblioteca…</Cargando>
        ) : visibles.length === 0 ? (
          <EstadoVacio
            titulo={buscando ? 'Ningun ejercicio coincide' : 'La biblioteca esta vacia'}
            /*
             * El caso de biblioteca vacia es raro —el alta del gimnasio la
             * siembra— asi que el texto dice lo que de verdad habria pasado, y
             * ahora si apunta a la salida: crear uno.
             */
            texto={
              buscando
                ? 'Prueba con otro nombre, con el material o con el grupo muscular.'
                : 'Este gimnasio ha borrado todos los ejercicios. Puedes crear uno nuevo.'
            }
          />
        ) : (
          <>
            <Tabla conListaEstrecha>
              <thead>
                <tr>
                  <th scope="col">Ejercicio</th>
                  <th scope="col">Grupo</th>
                  <th scope="col">Material</th>
                  <th scope="col">Origen</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((ejercicio) => (
                  <tr key={ejercicio.id}>
                    <td className={estilos.nombreRutina}>{ejercicio.name}</td>
                    <td>{NOMBRE_DEL_GRUPO[ejercicio.muscleGroup]}</td>
                    <td>{ejercicio.equipment ?? <span className={celda.tenue}>Sin material</span>}</td>
                    <td>
                      <Etiqueta tono={ejercicio.fromTemplate ? 'neutro' : 'acento'}>
                        {ejercicio.fromTemplate ? 'Del catalogo' : 'Del gimnasio'}
                      </Etiqueta>
                    </td>
                    <td className={celda.acciones}>
                      {borrando === ejercicio.id ? (
                        <ConfirmacionEnLinea
                          /*
                           * Se avisa de lo que pasa con las rutinas: el
                           * ejercicio no desaparece de ellas, queda senalado
                           * como que ya no esta en la biblioteca. Quien borra
                           * espera lo contrario si nadie se lo dice.
                           */
                          pregunta="¿Borrarlo? Las rutinas que lo usen lo marcaran como no disponible."
                          confirmando={false}
                          onConfirmar={() => void borrar(ejercicio.id)}
                          onCancelar={() => setBorrando(null)}
                        />
                      ) : (
                        <>
                          <Boton variante="sutil" onClick={() => setEditando(ejercicio)}>
                            Editar
                          </Boton>
                          <Boton variante="sutil" onClick={() => setBorrando(ejercicio.id)}>
                            Borrar
                          </Boton>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>

            <ListaApilada etiqueta="Ejercicios">
              {visibles.map((ejercicio) => (
                <FilaApilada
                  key={ejercicio.id}
                  titulo={ejercicio.name}
                  etiqueta={
                    <Etiqueta tono={ejercicio.fromTemplate ? 'neutro' : 'acento'}>
                      {ejercicio.fromTemplate ? 'Del catalogo' : 'Del gimnasio'}
                    </Etiqueta>
                  }
                >
                  <Dato etiqueta="Grupo">{NOMBRE_DEL_GRUPO[ejercicio.muscleGroup]}</Dato>
                  <Dato etiqueta="Material">
                    {ejercicio.equipment ?? <span className={celda.tenue}>Sin material</span>}
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
