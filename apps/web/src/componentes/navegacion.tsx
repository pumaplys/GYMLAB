'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icono } from '@/componentes/iconos';
import { destinoActivo, type Destino } from '@/lib/navegacion';
import estilos from './navegacion.module.css';

/**
 * La lista de destinos. La misma en la barra lateral, en el rail y en el cajon.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL TEXTO NO ES OPCIONAL, NI SIQUIERA EN EL RAIL.                         │
 * │                                                                          │
 * │ En el rail el texto se esconde a la vista con `.solo-lectores`, no se    │
 * │ quita: sigue siendo el nombre accesible del enlace y sigue leyendolo un  │
 * │ lector de pantalla. Un icono solo no dice si "la etiqueta" es Planes o   │
 * │ Configuracion, y quien atiende el mostrador no aprende catorce trazos.   │
 * │                                                                          │
 * │ Por eso el rail lleva ademas `title`: al posar el raton aparece la       │
 * │ palabra, que es como se aprende un icono sin manual.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El destino activo NO se marca solo con color: lleva `aria-current="page"`,
 * un filete a la izquierda y el texto en negrita. Con la pantalla en blanco y
 * negro se sigue viendo cual es.
 */
export function ListaDeDestinos({
  destinos,
  compacta = false,
  onNavegar,
}: {
  destinos: readonly Destino[];
  /** Solo iconos a la vista. El texto sigue ahi para quien no ve la pantalla. */
  compacta?: boolean;
  /** Para que el cajon se cierre al elegir. */
  onNavegar?: () => void;
}) {
  const ruta = usePathname();
  const activo = destinoActivo(
    destinos.map((d) => d.href),
    ruta,
  );

  return (
    <ul className={`${estilos.lista} ${compacta ? estilos.listaCompacta : ''}`.trim()}>
      {destinos.map((destino) => {
        const esActivo = destino.href === activo;
        return (
          <li key={destino.href}>
            <Link
              href={destino.href}
              onClick={onNavegar}
              title={compacta ? destino.texto : undefined}
              className={`${estilos.destino} ${esActivo ? estilos.activo : ''}`.trim()}
              aria-current={esActivo ? 'page' : undefined}
            >
              <Icono nombre={destino.icono} />
              <span className={compacta ? 'solo-lectores' : estilos.texto}>{destino.texto}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * La barra inferior del socio: cuatro destinos y "Mas".
 *
 * Cuatro y no siete porque a 375 px siete objetivos de 44 px no caben con su
 * palabra debajo. Los tres que quedan viven detras de "Mas", que se abre hacia
 * arriba desde donde esta el pulgar.
 *
 * "Mas" se marca como activo cuando la ruta actual es una de las suyas: sin
 * eso, estando en Privacidad la barra no señalaria nada y pareceria rota.
 */
export function BarraInferior({
  principales,
  secundarios,
}: {
  principales: readonly Destino[];
  secundarios: readonly Destino[];
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const botonMas = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);

  const todos = [...principales, ...secundarios].map((d) => d.href);
  const activo = destinoActivo(todos, ruta);
  const enSecundarios = secundarios.some((d) => d.href === activo);

  const cerrarHoja = useCallback(() => {
    setAbierto(false);
    botonMas.current?.focus();
  }, []);

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ ESTA HOJA DECIA SER UN MODAL Y NO LO ERA.                               │
   * │                                                                          │
   * │ Llevaba `role="dialog"` y `aria-modal="true"` desde D2, pero MEDIDO en   │
   * │ D6 al abrirla: el foco se quedaba fuera —en el propio boton "Mas"—, el   │
   * │ tabulador salia del dialogo a la pagina de detras y el fondo seguia      │
   * │ desplazandose. Anunciar "modal" y no serlo es peor que no anunciarlo.    │
   * │                                                                          │
   * │ El cajon del personal (`Cajon`) ya resolvia las tres cosas. Aqui se hace │
   * │ igual, no distinto: mismas doce lineas de trampa de foco a mano, mismo   │
   * │ bloqueo de `overflow`, mismo retorno de foco al disparador.              │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    if (!abierto) return;
    cerrar.current?.focus();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;

    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        cerrarHoja();
        return;
      }
      if (evento.key !== 'Tab' || !panel.current) return;

      const focales = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focales.length === 0) return;
      const primero = focales[0]!;
      const ultimo = focales[focales.length - 1]!;

      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto, cerrarHoja]);

  /* Con la hoja abierta, el fondo no se desplaza. */
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  return (
    <>
      {abierto && (
        <div className={estilos.hoja} role="dialog" aria-modal="true" aria-label="Mas secciones">
          {/*
            El velo cierra al pulsarlo, pero deja de ser un `button`: era el
            PRIMER tabulable del dialogo y medía 375x812, asi que quien llegaba
            con el teclado se encontraba un "Cerrar" invisible del tamaño de la
            pantalla antes que los tres destinos. Para el teclado ya estan
            Escape y el boton de la cabecera.
          */}
          <div className={estilos.veloHoja} onClick={cerrarHoja} aria-hidden="true" />

          <div className={estilos.panelHoja} ref={panel}>
            {/*
              Cabecera visible: la hoja se abria sin decir que era ni como se
              cerraba. El nombre accesible existia en `aria-label` —o sea, solo
              para quien no la ve—.
            */}
            <div className={estilos.cabeceraHoja}>
              <span className={estilos.tituloHoja}>Mas secciones</span>
              <button
                ref={cerrar}
                type="button"
                className={estilos.cerrarHoja}
                onClick={cerrarHoja}
                aria-label="Cerrar"
              >
                <Icono nombre="cerrar" />
              </button>
            </div>

            <ListaDeDestinos destinos={secundarios} onNavegar={() => setAbierto(false)} />
          </div>
        </div>
      )}

      <nav className={estilos.barra} aria-label="Secciones">
        {principales.map((destino) => {
          const esActivo = destino.href === activo;
          return (
            <Link
              key={destino.href}
              href={destino.href}
              className={`${estilos.pestana} ${esActivo ? estilos.pestanaActiva : ''}`.trim()}
              aria-current={esActivo ? 'page' : undefined}
            >
              <Icono nombre={destino.icono} />
              <span className={estilos.etiquetaPestana}>{destino.texto}</span>
            </Link>
          );
        })}

        <button
          ref={botonMas}
          type="button"
          className={`${estilos.pestana} ${enSecundarios ? estilos.pestanaActiva : ''}`.trim()}
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
        >
          <Icono nombre="mas" />
          <span className={estilos.etiquetaPestana}>Mas</span>
        </button>
      </nav>
    </>
  );
}
