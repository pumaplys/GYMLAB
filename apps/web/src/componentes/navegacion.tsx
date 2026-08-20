'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
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

  const todos = [...principales, ...secundarios].map((d) => d.href);
  const activo = destinoActivo(todos, ruta);
  const enSecundarios = secundarios.some((d) => d.href === activo);

  return (
    <>
      {abierto && (
        <div
          className={estilos.hoja}
          role="dialog"
          aria-modal="true"
          aria-label="Mas secciones"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAbierto(false);
              botonMas.current?.focus();
            }
          }}
        >
          <button
            type="button"
            className={estilos.veloHoja}
            aria-label="Cerrar"
            onClick={() => {
              setAbierto(false);
              botonMas.current?.focus();
            }}
          />
          <div className={estilos.panelHoja}>
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
