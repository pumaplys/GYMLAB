'use client';

import { useEffect, useState } from 'react';
import type { LegalData, PrivacyDocumentStatus } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { Etiqueta } from '@/componentes/etiqueta';
import { Marco } from '@/componentes/marco';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import { cambiosDe, explicarDocumento, faltantesLegibles } from './logica';
import estilos from './configuracion.module.css';

/**
 * Datos legales y privacidad. **Solo el dueno.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN ESTA PANTALLA, UN GIMNASIO NUEVO NO PUEDE RECOGER NI UN PESO.       │
 * │                                                                          │
 * │ Publicar el documento de privacidad exige la identidad del responsable   │
 * │ —razon social, NIF, domicilio y un contacto—, y hasta #75 no habia donde │
 * │ escribirla: la unica via era que alguien de GYMLAB hiciera un UPDATE a   │
 * │ mano en la base de datos de produccion por cada cliente que entrara.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Dos bloques separados a proposito: lo que el dueno RELLENA y lo que el
 * sistema HACE con ello. Mezclarlos invita a leer el estado del documento como
 * si fuera un campo mas del formulario.
 *
 * No dice en ningun sitio «cumple RGPD». Que los datos esten completos no es lo
 * mismo que que el texto ampare juridicamente nada, y confundir las dos cosas
 * es exactamente el error que esta pantalla no debe inducir.
 */
export default function ConfiguracionPage() {
  return (
    <RutaPrivada roles={['owner']}>
      <Marco>
        <Configuracion />
      </Marco>
    </RutaPrivada>
  );
}

const CAMPOS = [
  {
    clave: 'legalName' as const,
    etiqueta: 'Razón social',
    ayuda: 'La denominación con la que existe la sociedad, no el nombre comercial.',
    autoComplete: 'organization',
    tipo: 'text' as const,
  },
  {
    clave: 'taxId' as const,
    etiqueta: 'Identificador fiscal',
    ayuda: 'NIF o CIF de la sociedad.',
    autoComplete: 'off',
    tipo: 'text' as const,
  },
  {
    clave: 'address' as const,
    etiqueta: 'Domicilio',
    ayuda: 'Dirección postal del responsable.',
    autoComplete: 'street-address',
    tipo: 'text' as const,
  },
  {
    clave: 'privacyEmail' as const,
    etiqueta: 'Email de privacidad',
    ayuda: 'Donde los socios ejercen sus derechos. Puede ser distinto del de recepción.',
    autoComplete: 'email',
    tipo: 'email' as const,
  },
];

function Configuracion() {
  const { gymId, revisar } = useSesion();
  const [datos, setDatos] = useState<LegalData | null>(null);
  const [documento, setDocumento] = useState<PrivacyDocumentStatus | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    let vigente = true;

    (async () => {
      try {
        const [legal, estado] = await Promise.all([
          api.legal.get(gymId),
          api.legal.documentStatus(gymId),
        ]);
        if (!vigente) return;
        setDatos(legal);
        setDocumento(estado);
        setValores(desdeDatos(legal));
      } catch (fallo) {
        if (!vigente) return;
        if (esSesionCaducada(fallo)) return void revisar();
        setError(mensajeDeError(fallo));
      } finally {
        if (vigente) setCargando(false);
      }
    })();

    return () => {
      vigente = false;
    };
  }, [gymId, revisar]);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!gymId || !datos || guardando) return;

    const cambios = cambiosDe(valores, desdeDatos(datos));
    if (Object.keys(cambios).length === 0) {
      setError(null);
      setExito('No hay cambios que guardar.');
      return;
    }

    setGuardando(true);
    setError(null);
    setExito(null);

    try {
      const actualizado = await api.legal.update(gymId, cambios);
      setDatos(actualizado);
      // NO se reescriben los campos con la respuesta: el dueno acaba de
      // teclearlos y verlos parpadear sugiere que algo se ha perdido.
      setExito('Datos guardados.');
      setDocumento(await api.legal.documentStatus(gymId));
    } catch (fallo) {
      if (esSesionCaducada(fallo)) return void revisar();
      // Los valores escritos se quedan: perder lo tecleado por un fallo del
      // servidor obliga a reescribir cuatro campos para reintentar.
      setError(mensajeDeError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Cargando>Cargando la configuracion...</Cargando>;
  if (!datos) return <Aviso>{error ?? 'No se pudo cargar la configuración.'}</Aviso>;

  const faltan = faltantesLegibles(datos.missing);
  const completa = faltan.length === 0;

  return (
    <>
      <EncabezadoDePagina titulo="Configuración" entradilla="Datos legales y privacidad" />

      <Tarjeta
        titulo={<h2>Datos del responsable</h2>}
        acciones={
          /*
            El estado, en la cabecera y como pastilla.
            Era un `<strong>` suelto dentro de una caja gris con una lista de
            vinetas debajo: ocupaba cinco lineas para decir una cosa, y no se
            parecia a ningun otro estado del producto. La pastilla es la misma
            que dice "Activo" en un socio o "Archivada" en una rutina.
          */
          <Etiqueta tono={completa ? 'exito' : 'aviso'}>
            {completa ? 'Configuración completa' : 'Configuración incompleta'}
          </Etiqueta>
        }
      >
        <p className={estilos.introduccion}>
          Es quien figura ante tus socios como responsable del tratamiento de sus datos. Se
          copia dentro del documento de privacidad al publicarlo, y los documentos ya
          publicados no cambian si luego editas esto.
        </p>

        {/*
          Lo que falta va ANTES del formulario y en una sola linea: quien entra
          a arreglar algo necesita saber que falta antes de leer cuatro campos,
          pero no necesita una lista con vinetas para cuatro nombres.
        */}
        {!completa && (
          <Aviso tono="aviso">Faltan por rellenar: {faltan.join(', ')}.</Aviso>
        )}

        <form onSubmit={guardar} noValidate className={estilos.formulario}>
          {/*
            Dos columnas donde caben, y emparejadas por afinidad: la razon
            social con su identificador fiscal, el domicilio con el correo de
            privacidad. En estrecho la rejilla se pliega sola a una.
          */}
          <div className={estilos.campos}>
            {CAMPOS.map((campo) => (
              <Campo
                key={campo.clave}
                etiqueta={campo.etiqueta}
                ayuda={campo.ayuda}
                tipo={campo.tipo}
                autoComplete={campo.autoComplete}
                valor={valores[campo.clave] ?? ''}
                alCambiar={(valor) => setValores((previo) => ({ ...previo, [campo.clave]: valor }))}
                deshabilitado={guardando}
              />
            ))}
          </div>

          {error && <Aviso>{error}</Aviso>}
          {exito && <Aviso tono="exito">{exito}</Aviso>}

          {/* Filete y accion a la derecha: el mismo pie que el resto de
              formularios del panel. */}
          <div className={estilos.pie}>
            <Boton type="submit" variante="primario" cargando={guardando}>
              Guardar
            </Boton>
          </div>
        </form>
      </Tarjeta>

      {documento && <EstadoDelDocumento estado={documento} />}
    </>
  );
}

/**
 * El otro bloque: que ha hecho el sistema con esos datos.
 *
 * No hay boton de publicar, y es deliberado. El documento se publica solo
 * cuando un socio lo necesita, de forma idempotente y dentro de la transaccion
 * de su peticion. Anadir un paso administrativo aqui no lo haria mas seguro:
 * lo haria olvidable, y una funcionalidad que depende de que alguien se acuerde
 * de pulsar un boton acaba apagada. Lo que si hace falta es que el dueno pueda
 * SABER en que punto esta, y eso es lo que hay aqui.
 */
function EstadoDelDocumento({ estado }: { estado: PrivacyDocumentStatus }) {
  const explicacion = explicarDocumento(estado.state);

  return (
    <Tarjeta titulo={<h2>Documento de privacidad</h2>}>
      <Aviso tono={explicacion.tono}>
        <strong>{explicacion.titulo}</strong>
        <br />
        {explicacion.detalle}
      </Aviso>

      <dl className={estilos.detalles}>
        <div>
          <dt>Versión activa en la plataforma</dt>
          <dd>{estado.expectedVersion ?? 'Ninguna'}</dd>
        </div>
        <div>
          <dt>Versión publicada en tu gimnasio</dt>
          <dd>{estado.publishedVersion ?? 'Ninguna'}</dd>
        </div>
        {estado.publishedAt && (
          <div>
            <dt>Publicado el</dt>
            <dd>{new Date(estado.publishedAt).toLocaleDateString('es-ES')}</dd>
          </div>
        )}
      </dl>
    </Tarjeta>
  );
}

function desdeDatos(datos: LegalData): Record<string, string> {
  return {
    legalName: datos.legalName ?? '',
    taxId: datos.taxId ?? '',
    address: datos.address ?? '',
    privacyEmail: datos.privacyEmail ?? '',
  };
}
