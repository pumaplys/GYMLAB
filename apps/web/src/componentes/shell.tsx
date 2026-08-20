'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Boton } from '@/componentes/boton';
import { Cajon } from '@/componentes/cajon';
import { Icono } from '@/componentes/iconos';
import { BarraInferior, ListaDeDestinos } from '@/componentes/navegacion';
import { NOMBRE_DEL_ROL } from '@/lib/roles';
import { useSesion } from '@/lib/sesion';
import type { Destino } from '@/lib/navegacion';
import estilos from './shell.module.css';

/**
 * El armazon de la aplicacion. Uno solo para las tres areas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA NAVEGACION CAMBIA DE FORMA, NO DE CONTENIDO.                          │
 * │                                                                          │
 * │ Los mismos destinos se pintan de tres maneras segun el sitio, y las tres │
 * │ salen del MISMO array. No hay una lista para movil y otra para           │
 * │ escritorio: eso es como se acaba con un destino que existe en un ancho y │
 * │ no en otro — que es exactamente lo que pasaba, con "Configuracion"       │
 * │ recortada fuera de la pantalla a 375 px.                                 │
 * │                                                                          │
 * │   >= 1024   barra lateral con icono y texto                              │
 * │   768-1023  rail de iconos; el texto lo sigue leyendo un lector          │
 * │   < 768     cabecera compacta + cajon (personal) o barra inferior (socio)│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los tres modos se resuelven con CSS, no con `matchMedia`: el panel se exporta
 * estatico y una decision en JavaScript tendria que esperar a que hidrate,
 * enseñando la navegacion equivocada durante ese rato. Lo unico que decide
 * JavaScript es si el cajon esta abierto.
 */
export function Shell({
  destinos,
  barraPrincipales,
  barraSecundarios,
  modoMovil,
  ancho = 'trabajo',
  children,
}: {
  /** TODOS los destinos del area. Es lo que se pinta en lateral y en cajon. */
  destinos: readonly Destino[];
  /** Los que caben en la barra inferior. Los demas van detras de "Mas". */
  barraPrincipales?: readonly Destino[];
  barraSecundarios?: readonly Destino[];
  modoMovil: 'cajon' | 'barra';
  ancho?: 'trabajo' | 'lectura';
  children: ReactNode;
}) {
  const { estado, rol, gymId, salir, elegirGimnasio } = useSesion();
  const ruta = usePathname();
  const [cajonAbierto, setCajonAbierto] = useState(false);
  const botonMenu = useRef<HTMLButtonElement>(null);

  /* Navegar cierra el cajon. Sin esto se queda abierto sobre la pantalla nueva. */
  useEffect(() => setCajonAbierto(false), [ruta]);

  const yo = estado.fase === 'identificado' ? estado.yo : null;
  const gimnasio = yo?.memberships.find((m) => m.gymId === gymId);

  const cuenta = yo && (
    <div className={estilos.cuenta}>
      <span className={estilos.identidad}>
        <span className={estilos.nombre}>{yo.user.name}</span>
        {rol && <span className={estilos.rol}>{NOMBRE_DEL_ROL[rol]}</span>}
      </span>
      <Boton variante="sutil" tamano="sm" onClick={() => void salir()}>
        Salir
      </Boton>
    </div>
  );

  /*
   * El gimnasio activo. Un `select` y no un menu propio: cambiar de gimnasio es
   * elegir entre opciones excluyentes, que es lo que un `select` ya hace con
   * teclado, lector de pantalla y movil.
   */
  const contextoDeGimnasio =
    yo && yo.memberships.length > 1 ? (
      <>
        <label className="solo-lectores" htmlFor="gimnasio-activo">
          Gimnasio activo
        </label>
        <select
          id="gimnasio-activo"
          className={estilos.selectorDeGimnasio}
          value={gymId ?? ''}
          onChange={(evento) => void elegirGimnasio(evento.target.value)}
        >
          {yo.memberships.map((pertenencia) => (
            <option key={pertenencia.gymId} value={pertenencia.gymId}>
              {pertenencia.gymName}
            </option>
          ))}
        </select>
      </>
    ) : (
      <span className={estilos.gimnasio}>{gimnasio?.gymName}</span>
    );

  return (
    <div className={`${estilos.shell} ${modoMovil === 'barra' ? estilos.conBarra : ''}`.trim()}>
      {/*
        El salto al contenido va PRIMERO en el DOM: con la navegacion delante,
        quien usa teclado tabularia por todos los destinos en cada pantalla.
      */}
      <a href="#contenido" className={estilos.salto}>
        Saltar al contenido
      </a>

      {/* --- Barra lateral y rail: solo a partir de 768 --- */}
      <div className={estilos.lateral}>
        <div className={estilos.marca}>
          {/* En el rail no cabe la palabra: queda la inicial. Dos elementos y
              no un truco de CSS, para que el nombre accesible sea siempre el
              mismo. */}
          <span className={estilos.logotipo}>GYMLAB</span>
          <span className={estilos.logotipoCorto} aria-hidden="true">
            G
          </span>
        </div>
        <nav className={estilos.navLateral} aria-label="Secciones">
          <ListaDeDestinos destinos={destinos} />
        </nav>
        <div className={estilos.navRail}>
          <nav aria-label="Secciones">
            <ListaDeDestinos destinos={destinos} compacta />
          </nav>
        </div>
        {/*
          La cuenta va abajo y separada por un filete: no compite con la
          navegacion, que es lo que se usa cada minuto.
        */}
        <div className={estilos.pieLateral}>{cuenta}</div>
      </div>

      <div className={estilos.columna}>
        {/*
          La cabecera lleva el CONTEXTO y nada mas: que gimnasio y quien eres.
          Sin buscador global, sin notificaciones y sin migas de pan — ninguna
          de esas tres cosas existe en el producto, y ponerlas porque hay hueco
          es exactamente como se llega a un panel de plantilla.
        */}
        <header className={estilos.cabecera}>
          {/* El socio no lleva boton de menu: sus destinos estan en la barra
              inferior, al alcance del pulgar. */}
          {modoMovil === 'cajon' && (
            <button
              ref={botonMenu}
              type="button"
              className={estilos.botonMenu}
              aria-label="Abrir la navegacion"
              aria-expanded={cajonAbierto}
              onClick={() => setCajonAbierto(true)}
            >
              <Icono nombre="menu" />
            </button>
          )}

          <span className={estilos.marcaMovil}>GYMLAB</span>

          <div className={estilos.contexto}>{contextoDeGimnasio}</div>
          <div className={estilos.cuentaCabecera}>{cuenta}</div>
        </header>

        <main
          id="contenido"
          tabIndex={-1}
          className={`${estilos.contenido} ${ancho === 'lectura' ? estilos.lectura : ''}`.trim()}
        >
          {children}
        </main>
      </div>

      {modoMovil === 'cajon' && (
        <Cajon
          abierto={cajonAbierto}
          onCerrar={() => setCajonAbierto(false)}
          titulo="Secciones"
          disparador={botonMenu}
        >
          <nav aria-label="Secciones">
            <ListaDeDestinos destinos={destinos} onNavegar={() => setCajonAbierto(false)} />
          </nav>
          <div className={estilos.pieCajon}>{cuenta}</div>
        </Cajon>
      )}

      {modoMovil === 'barra' && barraPrincipales && barraSecundarios && (
        <div className={estilos.soloMovil}>
          <BarraInferior principales={barraPrincipales} secundarios={barraSecundarios} />
        </div>
      )}
    </div>
  );
}
