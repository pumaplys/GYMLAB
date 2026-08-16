'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import type { DuesStatus, Member } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { MarcoSocio } from '@/componentes/marco-socio';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import { lecturaDe } from '../cuota-logica';
import { CADA_CUANTO_MS, segundosRestantes, textoDeCuentaAtras } from './carne-logica';
import estilos from './carne.module.css';

/**
 * El carne digital y su QR de acceso.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL QR NO SE GENERA AL ENTRAR, Y NO ES UNA PREFERENCIA.                  │
 * │                                                                          │
 * │ El token dura SESENTA SEGUNDOS y se consume al escanearlo. Generarlo al  │
 * │ cargar la pantalla significaria que, para cuando alguien llega al torno, │
 * │ ya esta caducado — y ademas gastaria un token por cada vez que se abre   │
 * │ la pagina sin intencion de entrar.                                       │
 * │                                                                          │
 * │ Asi que hay un boton, y se pulsa delante de la puerta.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * EL TOKEN VIVE EN MEMORIA Y NADA MAS. No va a `localStorage` ni a la URL: es
 * una llave de entrada, y una llave que sobrevive al cierre de la pestana es una
 * llave perdida. Al cambiar de gimnasio o de rol, desaparece con el componente.
 */
export default function CarnePage() {
  return (
    <RutaPrivada>
      <MarcoSocio>
        <Carne />
      </MarcoSocio>
    </RutaPrivada>
  );
}

function Carne() {
  const { gymId, revisar, estado } = useSesion();

  const [ficha, setFicha] = useState<Member | null>(null);
  const [cuota, setCuota] = useState<DuesStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** El QR ya dibujado, y hasta cuando vale. Solo en memoria. */
  const [qr, setQr] = useState<{ svg: string; expiresAt: string } | null>(null);
  const [restan, setRestan] = useState(0);
  const [generando, setGenerando] = useState(false);
  const [errorAlGenerar, setErrorAlGenerar] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);
    /*
     * Al cambiar de gimnasio se tira el QR ANTES de pedir nada.
     *
     * Un codigo del gimnasio A en la pantalla de B es, como poco, confuso; y su
     * firma se deriva del gimnasio, asi que alli no valdria de todos modos. Lo
     * que no puede pasar es que se quede a la vista como si sirviera.
     */
    setQr(null);
    setErrorAlGenerar(null);
    setFicha(null);
    setCuota(null);

    Promise.all([
      api.yo.fichaDeSocio({ signal: control.signal }),
      api.yo.miCuota({ signal: control.signal }),
    ])
      .then(([mia, suCuota]) => {
        setFicha(mia);
        setCuota(suCuota);
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

  // La cuenta atras. Una vez por segundo, no por fotograma: el numero solo
  // cambia cada segundo y quien mira esto esta parado en una puerta.
  useEffect(() => {
    if (!qr) return;
    setRestan(segundosRestantes(qr.expiresAt));
    const reloj = setInterval(() => {
      setRestan(segundosRestantes(qr.expiresAt));
    }, CADA_CUANTO_MS);
    return () => clearInterval(reloj);
  }, [qr]);

  const generar = useCallback(async () => {
    if (generando) return;
    setGenerando(true);
    setErrorAlGenerar(null);
    try {
      const acceso = await api.yo.tokenDeAcceso();
      /*
       * SVG y no canvas: escala sin pixelarse en pantallas densas, no necesita
       * una referencia al DOM y no se pelea con la exportacion estatica. El
       * margen va dentro del propio SVG porque un QR pegado al borde de una
       * tarjeta no lo lee ningun escaner.
       */
      const svg = await QRCode.toString(acceso.token, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQr({ svg, expiresAt: acceso.expiresAt });
    } catch (problema: unknown) {
      if (esSesionCaducada(problema)) {
        void revisar();
        return;
      }
      setErrorAlGenerar(mensajeDeError(problema));
    } finally {
      setGenerando(false);
    }
  }, [generando, revisar]);

  const gimnasio =
    estado.fase === 'identificado'
      ? estado.yo.memberships.find((m) => m.gymId === gymId)?.gymName
      : undefined;

  if (cargando) return <Cargando>Cargando tu carne…</Cargando>;

  if (error || !ficha) {
    return (
      <>
        <EncabezadoDePagina titulo="Tu carne" />
        <Aviso>{error ?? 'No hemos podido cargar tu carne.'}</Aviso>
      </>
    );
  }

  const caducado = qr !== null && restan === 0;
  const lectura = cuota ? lecturaDe(cuota) : null;

  return (
    <>
      <EncabezadoDePagina titulo="Tu carne" />

      <Tarjeta className={estilos.carne}>
        {/* Quien soy, donde, y con que numero: la credencial. */}
        <div className={estilos.identidad}>
          <p className={estilos.nombre}>
            {ficha.firstName} {ficha.lastName}
          </p>
          {gimnasio && <p className={estilos.gimnasio}>{gimnasio}</p>}
          <p className={estilos.numero}>
            <span className={estilos.etiquetaNumero}>N.º de socio</span> {ficha.memberNumber}
          </p>
        </div>

        <div className={estilos.zonaQr}>
          {qr === null ? (
            <div className={estilos.hueco}>
              <p className={estilos.instruccion}>
                Genera tu codigo cuando estes en la puerta: <strong>solo vale un minuto</strong> y
                se usa una vez.
              </p>
              <Boton
                variante="primario"
                className={estilos.botonGrande}
                cargando={generando}
                onClick={() => void generar()}
              >
                Mostrar mi codigo
              </Boton>
            </div>
          ) : (
            <>
              {/*
                `aria-hidden` en la imagen: leerle a un lector de pantalla el
                contenido del QR no sirve de nada. Lo que importa lo dice el
                texto de estado que va debajo.
              */}
              <div
                className={caducado ? estilos.qrCaducado : estilos.qr}
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: qr.svg }}
              />

              {/*
                `role="status"` para que el cambio a "caducado" se anuncie sin
                interrumpir: no es una alerta, es informacion que llega sola.
              */}
              <p className={caducado ? estilos.caducado : estilos.vigente} role="status">
                {textoDeCuentaAtras(restan)}
              </p>

              <Boton
                variante={caducado ? 'primario' : 'secundario'}
                className={estilos.botonGrande}
                cargando={generando}
                onClick={() => void generar()}
              >
                {caducado ? 'Generar otro codigo' : 'Generar uno nuevo'}
              </Boton>
            </>
          )}

          {errorAlGenerar && <Aviso>{errorAlGenerar}</Aviso>}
        </div>
      </Tarjeta>

      {/*
        La cuota se muestra para ANTICIPAR, no para decidir: quien manda es el
        torno. Por eso el boton de generar sigue disponible aunque la cuota este
        vencida — el servidor genera el codigo igual, y es al escanearlo cuando
        se deniega. Ocultar el boton aqui mentiria sobre donde esta la regla.
      */}
      {lectura && cuota && !cuota.puedeAcceder && (
        <Aviso tono="informacion">
          <span>
            <strong>{lectura.titulo}.</strong> {lectura.explicacion} Es probable que la puerta no
            te deje pasar hasta que se resuelva.
          </span>
        </Aviso>
      )}

      <p className={estilos.pie}>
        ¿Dudas con tu cuota? Mirala en <Link href="/socio">Inicio</Link>.
      </p>
    </>
  );
}
