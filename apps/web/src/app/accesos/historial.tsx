'use client';

import { useEffect, useState } from 'react';
import type { AccessEventList } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Cargando } from '@/componentes/cargando';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Etiqueta } from '@/componentes/etiqueta';
import { Dato, FilaApilada, ListaApilada } from '@/componentes/lista-apilada';
import { Tabla, celda } from '@/componentes/tabla';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import { MENSAJE_DEL_MOTIVO } from './escaner-logica';
import estilos from './accesos.module.css';

/**
 * Los accesos del gimnasio.
 *
 * Solo lectura, y no por falta de tiempo: un registro de entradas del que se
 * pueden borrar filas no sirve para nada. La purga la hace el sistema según
 * `access_events_retention_months`.
 *
 * `refresco` se incrementa desde fuera cuando el escáner verifica algo, para
 * que la entrada que se acaba de conceder aparezca sin recargar la página.
 */
export function Historial({ refresco }: { refresco: number }) {
  const { gymId, revisar } = useSesion();
  const [datos, setDatos] = useState<AccessEventList | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();

    (async () => {
      try {
        setError(null);
        setDatos(await api.accesos.events(gymId, { pageSize: 25 }, { signal: control.signal }));
      } catch (fallo) {
        if (control.signal.aborted) return;
        if (esSesionCaducada(fallo)) return void revisar();
        setError(mensajeDeError(fallo));
      } finally {
        if (!control.signal.aborted) setCargando(false);
      }
    })();

    return () => control.abort();
  }, [gymId, revisar, refresco]);

  if (cargando) return <Cargando>Cargando el historial de accesos…</Cargando>;
  if (error) return <Aviso>{error}</Aviso>;
  if (!datos || datos.items.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavia no hay accesos"
        texto="Cuando alguien escanee su carné, la entrada aparecerá aquí."
      />
    );
  }

  return (
    <Tarjeta>
      <h2 className={estilos.titulo}>Últimos accesos</h2>

      <Tabla conListaEstrecha>
        <thead>
          <tr>
            <th scope="col">Cuándo</th>
            <th scope="col">Socio</th>
            <th scope="col">Resultado</th>
            <th scope="col">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {datos.items.map((evento) => (
          <tr key={evento.id}>
            <td className={celda.tenue}>{comoMomento(evento.occurredAt)}</td>
            <td>
              {/*
                Sin socio es lo NORMAL en los intentos técnicos: una firma
                inválida no identifica a nadie de fiar. No se filtran ni se
                disfrazan — que aparezcan es la señal de que alguien lo intentó.
              */}
              {evento.memberName ?? <span className={celda.tenue}>—</span>}
            </td>
            <td>
              <Etiqueta tono={evento.decision === 'DENY' ? 'peligro' : 'neutro'}>
                {evento.decision}
              </Etiqueta>
              {evento.isRetry && <span className={estilos.relectura}>relectura</span>}
            </td>
              <td className={celda.tenue}>{MENSAJE_DEL_MOTIVO[evento.reason]}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>

      <ListaApilada etiqueta="Últimos accesos">
        {datos.items.map((evento) => (
          <FilaApilada key={evento.id} titulo={evento.memberName ?? 'Sin socio identificado'}>
            <Dato etiqueta="Cuándo">{comoMomento(evento.occurredAt)}</Dato>
            <Dato etiqueta="Resultado">
              {evento.decision}
              {evento.isRetry && ' (relectura)'}
            </Dato>
            <Dato etiqueta="Motivo">{MENSAJE_DEL_MOTIVO[evento.reason]}</Dato>
          </FilaApilada>
        ))}
      </ListaApilada>

      {datos.total > datos.items.length && (
        <p className={estilos.pie}>
          Se muestran {datos.items.length} de {datos.total} accesos.
        </p>
      )}
    </Tarjeta>
  );
}

/** Fecha y hora: en la puerta importa el minuto, no solo el día. */
function comoMomento(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
