'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MemberList } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { BotonEnlace } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Etiqueta } from '@/componentes/etiqueta';
import { Marco } from '@/componentes/marco';
import { Paginacion } from '@/componentes/paginacion';
import { Tabla, celda } from '@/componentes/tabla';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { ROLES_DEL_PANEL } from '@/lib/roles';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './socios.module.css';

const POR_PAGINA = 25;
/** Lo que se espera a que alguien deje de teclear antes de preguntar. */
const ESPERA_BUSQUEDA_MS = 300;

export default function SociosPage() {
  return (
    <RutaPrivada roles={ROLES_DEL_PANEL}>
      <Marco>
        <Socios />
      </Marco>
    </RutaPrivada>
  );
}

function Socios() {
  const { gymId, revisar } = useSesion();

  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(1);

  const [lista, setLista] = useState<MemberList | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Se espera a que pare de teclear. Sin esto, "Fernandez" son nueve consultas
  // y ocho de ellas se descartan nada mas llegar.
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setConsulta(busqueda.trim());
      setPagina(1);
    }, ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(temporizador);
  }, [busqueda]);

  useEffect(() => {
    if (!gymId) return;

    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.members
      .list(
        gymId,
        { q: consulta || undefined, page: pagina, pageSize: POR_PAGINA },
        { signal: control.signal },
      )
      .then((resultado) => {
        setLista(resultado);
        setCargando(false);
      })
      .catch((problema: unknown) => {
        // La peticion anterior se cancela cuando cambia la busqueda o la
        // pagina. Ese rechazo no es un fallo y no debe pintar nada: la
        // siguiente ya viene en camino.
        if (control.signal.aborted) return;

        // La sesion de recepcion caduca dentro de la jornada, asi que esto pasa
        // a diario. Se vuelve a preguntar por ella y `RutaPrivada` se encarga
        // de llevar a la pantalla de entrada.
        if (esSesionCaducada(problema)) {
          void revisar();
          return;
        }

        setError(mensajeDeError(problema));
        setCargando(false);
      });

    return () => control.abort();
  }, [gymId, consulta, pagina, revisar]);

  const buscando = consulta !== '';
  // Solo la primera carga deja la tabla en blanco. Despues se atenua la que ya
  // habia, que sigue siendo informacion valida mientras llega la siguiente.
  const primeraCarga = cargando && lista === null;

  return (
    <>
      <EncabezadoDePagina
        titulo="Socios"
        acciones={
          <BotonEnlace href="/socios/nuevo" variante="primario">
            Nuevo socio
          </BotonEnlace>
        }
      />

      <div className={estilos.herramientas}>
        <label className="solo-lectores" htmlFor="buscar-socio">
          Buscar socios
        </label>
        <input
          id="buscar-socio"
          type="search"
          className={estilos.buscador}
          placeholder="Buscar por nombre, email o numero"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
      </div>

      {error && <Aviso>{error}</Aviso>}

      <Tarjeta variante="lista">
        {primeraCarga ? (
          <Cargando>Cargando socios…</Cargando>
        ) : lista && lista.items.length === 0 ? (
          <EstadoVacio
            titulo={buscando ? 'Ningun socio coincide con la busqueda' : 'Todavia no hay socios'}
            texto={
              buscando
                ? 'Prueba con otro nombre, con el email o con el numero de socio.'
                : 'Cuando des de alta al primero aparecera aqui.'
            }
          />
        ) : (
          lista && (
            <>
              <div className={cargando ? estilos.refrescando : ''}>
                <Tabla filasPulsables>
                  <thead>
                    <tr>
                      <th scope="col">N.º</th>
                      <th scope="col">Nombre</th>
                      <th scope="col">Correo</th>
                      <th scope="col">Telefono</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Alta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.items.map((socio) => (
                      <tr key={socio.id}>
                        <td className={`${celda.numerica} ${celda.tenue}`}>{socio.memberNumber}</td>
                        <td className={estilos.nombre}>
                          {/*
                            El nombre es el enlace, no una fila entera pinchable:
                            asi se puede abrir en otra pestana, se navega con el
                            tabulador y un lector de pantalla lo anuncia como lo
                            que es.
                          */}
                          <Link
                            className={estilos.enlace}
                            href={`/socios/ficha?id=${encodeURIComponent(socio.id)}`}
                          >
                            {socio.firstName} {socio.lastName}
                          </Link>
                        </td>
                        <td>{socio.email ?? <span className={celda.tenue}>—</span>}</td>
                        <td>{socio.phone ?? <span className={celda.tenue}>—</span>}</td>
                        <td>
                          <Etiqueta tono={socio.status === 'active' ? 'exito' : 'neutro'}>
                            {socio.status === 'active' ? 'Activo' : 'Inactivo'}
                          </Etiqueta>
                        </td>
                        <td className={celda.tenue}>{comoFecha(socio.joinedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </div>

              <Paginacion
                pagina={lista.page}
                tamano={lista.pageSize}
                total={lista.total}
                deshabilitada={cargando}
                alCambiar={setPagina}
              />
            </>
          )
        )}
      </Tarjeta>
    </>
  );
}
