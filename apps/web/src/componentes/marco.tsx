'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boton } from '@/componentes/boton';
import { NOMBRE_DEL_ROL } from '@/lib/roles';
import { useSesion } from '@/lib/sesion';
import estilos from './marco.module.css';

/**
 * Los destinos del panel. La lista es el sitio donde crece.
 *
 * Son TRES, y son los que existen: `/socios`, `/personal` y `/planes`. No hay
 * panel de inicio, ni entrenadores, ni rutinas, ni configuracion — y mientras
 * no los haya no se anuncian aqui. Un enlace que lleva a un 404 cuesta mas
 * confianza de la que ahorra tenerlo preparado.
 *
 * `soloDueno` no protege nada —la autorizacion la impone el servidor— sino que
 * evita ofrecer un destino que responderia "esta seccion no es para tu rol".
 * Los precios son decision del dueno; el mostrador solo los consulta al cobrar.
 */
const DESTINOS = [
  { href: '/socios', texto: 'Socios', soloDueno: false },
  { href: '/personal', texto: 'Personal', soloDueno: false },
  { href: '/planes', texto: 'Planes', soloDueno: true },
] as const;

/**
 * El marco del panel: contexto arriba, destinos debajo, contenido dentro.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DOS BANDAS, Y LA SEPARACION ES LA IDEA.                                  │
 * │                                                                          │
 * │   contexto   GYMLAB │ Gimnasio Maqueta          Ana Duena · Duena  Salir │
 * │   ────────────────────────────────────────────────────────────────────── │
 * │   destinos   Socios   Personal   Planes                                  │
 * │                                                                          │
 * │ Arriba va lo que dice DONDE ESTOY y QUIEN SOY; debajo, lo unico que      │
 * │ lleva a otro sitio. Antes convivian en la misma fila y el gimnasio       │
 * │ colgaba de la marca con una barra —`GYMLAB / Gimnasio Centro`—, que se   │
 * │ lee como una ruta: como si el gimnasio fuera un sitio al que se ha       │
 * │ navegado y no el dato que decide QUE DATOS SE ESTAN VIENDO. En un        │
 * │ producto multi-inquilino esa confusion es cara.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE NO HAY BARRA LATERAL
 *
 * Medido en el navegador a 1024 px, que es un portatil corriente: una columna
 * de 240 px deja los tres destinos ocupando 109 px de 800 de alto —el 86 % de
 * la columna vacia— y le quita 240 px al contenido, con lo que la tabla de
 * socios baja de 974 a 734 px. Para recepcion, que solo ve dos destinos, la
 * columna se queda en el 9 % ocupada. Se paga cada dia una cuarta parte del
 * ancho de la tabla a cambio de una lista de dos elementos. Cuando los
 * destinos crezcan, la barra lateral se gana el sitio; hoy no.
 *
 * Se pinta solo dentro de `RutaPrivada`, asi que aqui ya hay sesion y gimnasio
 * activo. Si algo de eso faltara seria un error de composicion, no un estado
 * que haya que dibujar.
 */
export function Marco({ children }: { children: ReactNode }) {
  const { estado, rol, gymId, salir, elegirGimnasio } = useSesion();
  const ruta = usePathname();

  const yo = estado.fase === 'identificado' ? estado.yo : null;
  if (!yo) return null;

  const actual = yo.memberships.find((m) => m.gymId === gymId);
  const visibles = DESTINOS.filter((destino) => !destino.soloDueno || rol === 'owner');

  return (
    <div className={estilos.marco}>
      {/*
        Con la navegacion arriba, quien usa teclado tabula por la marca, el
        gimnasio y los destinos antes de llegar al contenido — en cada pantalla.
        El salto lo evita, y solo aparece cuando se le da el foco.
      */}
      <a href="#contenido" className={estilos.salto}>
        Saltar al contenido
      </a>

      <header className={estilos.cabecera}>
        <div className={estilos.contexto}>
          <span className={estilos.marca}>GYMLAB</span>
          <span className={estilos.division} aria-hidden="true" />

          {yo.memberships.length > 1 ? (
            // Un desplegable y no un menu propio: cambiar de gimnasio es elegir
            // entre opciones excluyentes, que es exactamente lo que un `select`
            // hace ya con teclado, lector de pantalla y movil.
            <>
              <label className="solo-lectores" htmlFor="gimnasio-activo">
                Gimnasio activo
              </label>
              <select
                id="gimnasio-activo"
                className={estilos.selector}
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
            <span className={estilos.gimnasio}>{actual?.gymName}</span>
          )}

          <div className={estilos.cuenta}>
            <span className={estilos.identidad}>
              <span className={estilos.nombre}>{yo.user.name}</span>
              {rol && <span className={estilos.rol}>{NOMBRE_DEL_ROL[rol]}</span>}
            </span>
            <Boton variante="sutil" onClick={() => void salir()}>
              Salir
            </Boton>
          </div>
        </div>

        <div className={estilos.banda}>
          <nav className={estilos.destinos} aria-label="Secciones">
            {visibles.map((destino) => {
              const activo = ruta === destino.href || ruta.startsWith(`${destino.href}/`);
              return (
                <Link
                  key={destino.href}
                  href={destino.href}
                  className={`${estilos.enlace} ${activo ? estilos.activo : ''}`}
                  aria-current={activo ? 'page' : undefined}
                >
                  {destino.texto}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/*
        `tabIndex={-1}` para que el salto pueda dejar el foco aqui: sin el, el
        navegador mueve la vista pero el foco sigue en la cabecera y el
        siguiente tabulador vuelve a la navegacion.
      */}
      <main id="contenido" tabIndex={-1} className={estilos.contenido}>
        {children}
      </main>
    </div>
  );
}
