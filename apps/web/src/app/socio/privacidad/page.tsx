'use client';

import { useEffect, useState } from 'react';
import type { HealthConsentStatus } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { ConfirmacionEnLinea } from '@/componentes/confirmacion-en-linea';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { MarcoSocio } from '@/componentes/marco-socio';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './privacidad.module.css';

/**
 * El socio decide sobre sus datos de salud.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI SE LEE ANTES DE ACEPTAR. NO ES UNA CASILLA.                        │
 * │                                                                          │
 * │ El consentimiento del art. 9 tiene que ser explicito e INFORMADO. Un     │
 * │ boton que diga "acepto la version 2026-09-01" sin nada que leer recoge   │
 * │ un clic, no un consentimiento — y ante una autoridad de control no       │
 * │ prueba nada.                                                             │
 * │                                                                          │
 * │ Por eso el texto viene del servidor con el estado y se pinta entero,     │
 * │ antes del boton. El documento es inmutable: lo que se acepta aqui es una │
 * │ version concreta que despues se puede volver a ensenar tal cual.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Y ES SUYO. Ni el entrenador ni el gimnasio aceptan por el desde su area: el
 * servidor resuelve la ficha por la sesion, asi que estas rutas no tienen
 * ningun identificador que manipular.
 */
export default function PrivacidadPage() {
  return (
    <RutaPrivada>
      <MarcoSocio>
        <Privacidad />
      </MarcoSocio>
    </RutaPrivada>
  );
}

function Privacidad() {
  const { gymId, revisar } = useSesion();

  const [estado, setEstado] = useState<HealthConsentStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [revocando, setRevocando] = useState(false);
  const [hecho, setHecho] = useState<'aceptado' | 'revocado' | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);
    // El cambio de gimnasio recarga: el consentimiento es de ESTE gimnasio, no
    // de la persona. Lo aceptado en otro no vale aqui.
    setEstado(null);
    setHecho(null);
    setRevocando(false);

    api.yo
      .consentimientoDeSalud({ signal: control.signal })
      .then((suyo) => {
        setEstado(suyo);
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

  const ejecutar = async (que: 'aceptado' | 'revocado') => {
    if (trabajando || !estado?.document) return;
    setTrabajando(true);
    setError(null);
    try {
      const nuevo =
        que === 'aceptado'
          ? await api.yo.aceptarConsentimientoDeSalud(estado.document.version)
          : await api.yo.revocarConsentimientoDeSalud();
      setEstado(nuevo);
      setRevocando(false);
      setHecho(que);
    } catch (problema: unknown) {
      if (esSesionCaducada(problema)) {
        void revisar();
        return;
      }
      setError(mensajeDeError(problema));
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando) return <Cargando>Cargando…</Cargando>;

  return (
    <>
      {/*
        Sin "volver": esta pantalla nacio colgando de Inicio, cuando el area del
        socio no tenia barra de destinos. Ahora es uno de los siete, y ninguno de
        los otros seis lleva un enlace de vuelta — tenerlo solo aqui hacia que
        pareciera una subpantalla de algo, no una seccion mas.
      */}
      <EncabezadoDePagina
        titulo="Datos de salud"
        entradilla="Tu peso y tus medidas solo se pueden registrar si tu lo autorizas."
      />

      {error && <Aviso>{error}</Aviso>}

      {hecho === 'aceptado' && (
        <Aviso tono="exito">
          Autorizacion registrada. Tu entrenador ya puede anotar tus mediciones.
        </Aviso>
      )}
      {hecho === 'revocado' && (
        <Aviso tono="exito">
          Autorizacion retirada. No se podran registrar mediciones nuevas; las anteriores se
          conservan hasta que pidas que se borren.
        </Aviso>
      )}

      {/*
        Sin documento publicado no hay nada que aceptar. Se dice y no se ofrece
        un boton que el servidor rechazaria.
      */}
      {estado?.document == null ? (
        <Tarjeta>
          <p className={estilos.parrafo}>
            Tu gimnasio todavia no ha publicado el documento de tratamiento de datos de salud, asi
            que por ahora no hay nada que autorizar ni nadie puede registrar tus mediciones.
          </p>
        </Tarjeta>
      ) : (
        <>
          <Tarjeta className={estilos.tarjeta}>
            <div className={estilos.cabecera}>
              <h2 className={estilos.titulo}>{estado.document.title}</h2>
              <p className={estilos.meta}>
                Version {estado.document.version} · Publicada el{' '}
                {comoFecha(estado.document.publishedAt)}
              </p>
            </div>

            {/*
              El texto TAL CUAL lo publico el gimnasio. Se parte por parrafos y
              no se reinterpreta: lo que se acepta es esto, no un resumen.
            */}
            <div className={estilos.texto}>
              {estado.document.body.split('\n\n').map((parrafo, indice) => (
                <p key={indice}>{parrafo}</p>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta className={estilos.tarjeta}>
            {estado.accepted ? (
              <>
                <p className={estilos.estadoActual}>
                  <span className={estilos.aceptado}>Lo has autorizado</span>
                  {estado.acceptedAt && <> el {comoFecha(estado.acceptedAt)}</>}.
                </p>
                <p className={estilos.parrafo}>
                  Puedes retirarlo cuando quieras. Al hacerlo dejaran de poder registrarse
                  mediciones nuevas.
                </p>
                {revocando ? (
                  <ConfirmacionEnLinea
                    pregunta="¿Retirar la autorizacion?"
                    confirmando={trabajando}
                    onConfirmar={() => void ejecutar('revocado')}
                    onCancelar={() => setRevocando(false)}
                  />
                ) : (
                  <Boton onClick={() => setRevocando(true)}>Retirar la autorizacion</Boton>
                )}
              </>
            ) : (
              <>
                <p className={estilos.parrafo}>
                  Al autorizar, tu entrenador podra registrar tu peso y tus medidas. Sin esta
                  autorizacion no se guarda ninguno de esos datos.
                </p>
                <Boton
                  variante="primario"
                  className={estilos.principal}
                  cargando={trabajando}
                  onClick={() => void ejecutar('aceptado')}
                >
                  Autorizo el tratamiento de mis datos de salud
                </Boton>
              </>
            )}
          </Tarjeta>
        </>
      )}
    </>
  );
}
