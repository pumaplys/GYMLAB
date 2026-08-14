'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AssignedMember } from '@gymlab/contracts';
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
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './entrenador.module.css';

/**
 * Mis socios: la pantalla de trabajo del entrenador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `/entrenador` ES "MIS SOCIOS", Y POR ESO NO HAY MENU.                    │
 * │                                                                          │
 * │ El area tiene dos pantallas —esta y la ficha de un socio— y a la segunda │
 * │ se llega desde la primera, igual que en el panel se llega a la ficha     │
 * │ desde el listado. Una barra de navegacion con un solo destino que apunta │
 * │ a donde ya estas no informa de nada.                                     │
 * │                                                                          │
 * │ Cuando lleguen rutinas y progreso habra mas de un destino real y el      │
 * │ hueco ya esta preparado en `Armazon`.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function EntrenadorPage() {
  return (
    <RutaPrivada>
      <MarcoEntrenador>
        <MisSocios />
      </MarcoEntrenador>
    </RutaPrivada>
  );
}

function MisSocios() {
  const { gymId, revisar } = useSesion();
  const [socios, setSocios] = useState<AssignedMember[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  /*
   * Depende de `gymId`: al cambiar de gimnasio hay que volver a preguntar.
   *
   * Si esa cuenta es entrenadora en otro gimnasio, la lista es otra; y si en el
   * nuevo no es entrenadora, `RutaPrivada` la habra sacado ya del area. Sin
   * esta dependencia se quedaria en pantalla la cartera del gimnasio anterior.
   */
  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.yo
      .misSocios({ signal: control.signal })
      .then((mios) => {
        setSocios(mios);
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

  /*
   * El filtro es de pantalla, no de servidor.
   *
   * El endpoint no admite busqueda —lo devuelve todo— porque un entrenador
   * lleva una cartera de personas, no un censo. Filtrar aqui evita un viaje por
   * cada tecla y responde al instante, que es lo que hace falta cuando alguien
   * busca un nombre con el movil en la mano y el socio delante.
   */
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q || !socios) return socios ?? [];
    return socios.filter((socio) =>
      `${socio.firstName} ${socio.lastName} ${socio.memberNumber}`.toLowerCase().includes(q),
    );
  }, [socios, busqueda]);

  const buscando = busqueda.trim() !== '';

  return (
    <>
      <EncabezadoDePagina
        titulo="Mis socios"
        entradilla="Las personas que tienes asignadas en este gimnasio."
      />

      {error && <Aviso>{error}</Aviso>}

      {/* El buscador solo aparece cuando hay lista que filtrar. */}
      {socios && socios.length > 0 && (
        <div className={estilos.herramientas}>
          <label className="solo-lectores" htmlFor="buscar-mi-socio">
            Buscar entre mis socios
          </label>
          <input
            id="buscar-mi-socio"
            type="search"
            className={estilos.buscador}
            placeholder="Buscar por nombre o numero"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>
      )}

      <Tarjeta variante="lista">
        {cargando ? (
          <Cargando>Cargando tus socios…</Cargando>
        ) : visibles.length === 0 ? (
          <EstadoVacio
            titulo={buscando ? 'Ninguno coincide con la busqueda' : 'Todavia no tienes socios'}
            /*
             * Sin sugerir nada que el entrenador no pueda hacer: asignar socios
             * es del dueno o de recepcion. Decirle "asigna uno" seria mandarle
             * a una pantalla que su rol no abre.
             */
            texto={
              buscando
                ? 'Prueba con otro nombre o con su numero de socio.'
                : 'Cuando el gimnasio te asigne a alguien aparecera aqui.'
            }
          />
        ) : (
          <>
            <Tabla filasPulsables conListaEstrecha>
              <thead>
                <tr>
                  <th scope="col">N.º</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Telefono</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Asignado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((socio) => (
                  <tr key={socio.id}>
                    <td className={`${celda.numerica} ${celda.tenue}`}>{socio.memberNumber}</td>
                    <td className={estilos.nombre}>
                      <Link className={estilos.enlace} href={fichaDe(socio)}>
                        {socio.firstName} {socio.lastName}
                      </Link>
                    </td>
                    <td>{socio.phone ?? <span className={celda.tenue}>—</span>}</td>
                    <td>
                      <Etiqueta tono={socio.status === 'active' ? 'exito' : 'neutro'}>
                        {socio.status === 'active' ? 'Activo' : 'De baja'}
                      </Etiqueta>
                    </td>
                    <td className={celda.tenue}>{comoFecha(socio.assignedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>

            {/*
              En estrecho, cada socio es una tarjeta y la tarjeta ENTERA abre su
              ficha: el entrenador anda por la sala con el movil en una mano.
            */}
            <ListaApilada etiqueta="Mis socios">
              {visibles.map((socio) => (
                <FilaApilada
                  key={socio.id}
                  href={fichaDe(socio)}
                  titulo={
                    <>
                      <span className={estilos.numeroEnTarjeta}>
                        <span className="solo-lectores">Numero de socio </span>
                        {socio.memberNumber}
                      </span>
                      {socio.firstName} {socio.lastName}
                    </>
                  }
                  etiqueta={
                    <Etiqueta tono={socio.status === 'active' ? 'exito' : 'neutro'}>
                      {socio.status === 'active' ? 'Activo' : 'De baja'}
                    </Etiqueta>
                  }
                >
                  <Dato etiqueta="Telefono">
                    {socio.phone ?? <span className={celda.tenue}>—</span>}
                  </Dato>
                  <Dato etiqueta="Asignado">{comoFecha(socio.assignedAt)}</Dato>
                </FilaApilada>
              ))}
            </ListaApilada>
          </>
        )}
      </Tarjeta>
    </>
  );
}

/**
 * `?id=` y no `/entrenador/socios/[id]`.
 *
 * El mismo motivo que la ficha del panel: el frontend se exporta estatico, asi
 * que `next build` genera un fichero por ruta y no hay servidor que resuelva
 * segmentos dinamicos. Enumerar en construccion los socios de todos los
 * gimnasios no es posible — y ademas cambian cada dia.
 */
function fichaDe(socio: AssignedMember): string {
  return `/entrenador/socio?id=${encodeURIComponent(socio.id)}`;
}
