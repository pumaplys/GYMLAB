'use client';

import { useEffect, useState } from 'react';
import type { Member } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { BotonEnlace } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { MarcoSocio } from '@/componentes/marco-socio';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './socio.module.css';

/**
 * La portada del area de socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES UN CIMIENTO, NO UNA PANTALLA DE PRODUCTO.                             │
 * │                                                                          │
 * │ Demuestra lo mismo que la del entrenador —enrutado por area, marco       │
 * │ propio, contexto por sesion— con la diferencia que importa: aqui el      │
 * │ contexto se pide a `/me/member-profile`, que tampoco lleva ningun        │
 * │ identificador en la ruta.                                                │
 * │                                                                          │
 * │ El carne con el QR, la cuota, la rutina y el progreso llegan despues. Y  │
 * │ dos de ellas necesitan ademas endpoints que todavia no existen —sus      │
 * │ pagos y sus accesos—, apuntados en la auditoria.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function SocioPage() {
  return (
    <RutaPrivada>
      <MarcoSocio>
        <Inicio />
      </MarcoSocio>
    </RutaPrivada>
  );
}

function Inicio() {
  const { gymId, revisar } = useSesion();
  const [ficha, setFicha] = useState<Member | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.yo
      .fichaDeSocio({ signal: control.signal })
      .then((mia) => {
        setFicha(mia);
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
        titulo="Tu cuenta"
        entradilla="Tu area personal. Tu rutina, tu cuota y tu carne llegan en las siguientes entregas."
      />

      {error && <Aviso>{error}</Aviso>}

      <Tarjeta>
        {cargando ? (
          <Cargando>Cargando tus datos…</Cargando>
        ) : (
          ficha && (
            <dl className={estilos.datos}>
              <dt>Nombre</dt>
              <dd>
                {ficha.firstName} {ficha.lastName}
              </dd>

              <dt>N.º de socio</dt>
              <dd className={estilos.numero}>{ficha.memberNumber}</dd>

              <dt>Alta</dt>
              <dd>{new Date(ficha.joinedAt).toLocaleDateString('es-ES')}</dd>
            </dl>
          )
        )}
      </Tarjeta>

      {/*
        Se enlaza siempre, tambien si el gimnasio no tiene texto publicado: la
        pantalla lo explica. Esconder el enlace dejaria a quien quiere retirar su
        autorizacion sin forma de llegar, y retirarla es un derecho.
      */}
      <Tarjeta className={estilos.enlace}>
        <BotonEnlace href="/socio/privacidad">Tus datos de salud</BotonEnlace>
        <p className={estilos.pista}>
          Decide si tu gimnasio puede registrar tu peso y tus medidas.
        </p>
      </Tarjeta>
    </>
  );
}
