'use client';

import { useEffect, useState } from 'react';
import type { MemberList } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { BotonEnlace } from '@/componentes/boton';
import { Marco } from '@/componentes/marco';
import { Paginacion } from '@/componentes/paginacion';
import { RutaPrivada } from '@/componentes/ruta-privada';
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
      <div className={estilos.encabezado}>
        <h1>Socios</h1>
        <BotonEnlace href="/socios/nuevo" variante="primario">
          Nuevo socio
        </BotonEnlace>
      </div>

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

      <div className={estilos.panel}>
        {primeraCarga ? (
          <p className={estilos.cargando} role="status">
            Cargando socios…
          </p>
        ) : lista && lista.items.length === 0 ? (
          <div className={estilos.vacio}>
            <p className={estilos.vacioTitulo}>
              {buscando ? 'Ningun socio coincide con la busqueda' : 'Todavia no hay socios'}
            </p>
            <p className={estilos.vacioTexto}>
              {buscando
                ? 'Prueba con otro nombre, con el email o con el numero de socio.'
                : 'Cuando des de alta al primero aparecera aqui.'}
            </p>
          </div>
        ) : (
          lista && (
            <>
              <div className={`${estilos.desplazable} ${cargando ? estilos.refrescando : ''}`}>
                <table className={estilos.tabla}>
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
                        <td className={estilos.numero}>{socio.memberNumber}</td>
                        <td className={estilos.nombre}>
                          {socio.firstName} {socio.lastName}
                        </td>
                        <td>{socio.email ?? <span className={estilos.tenue}>—</span>}</td>
                        <td>{socio.phone ?? <span className={estilos.tenue}>—</span>}</td>
                        <td>
                          <span
                            className={`${estilos.etiqueta} ${
                              socio.status === 'active' ? estilos.activo : estilos.inactivo
                            }`}
                          >
                            {socio.status === 'active' ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className={estilos.tenue}>{comoFecha(socio.joinedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
      </div>
    </>
  );
}
