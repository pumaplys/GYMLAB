'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boton } from '@/componentes/boton';
import { NOMBRE_DEL_ROL } from '@/lib/roles';
import { useSesion } from '@/lib/sesion';
import estilos from './marco.module.css';

/**
 * Las secciones del panel. La lista es el sitio donde crece.
 *
 * `soloDueno` no protege nada —la autorizacion la impone el servidor— sino que
 * evita ofrecer una pestana que responderia "esta seccion no es para tu rol".
 * Los precios son decision del dueno; el mostrador solo los consulta al cobrar.
 */
const SECCIONES = [
  { href: '/socios', texto: 'Socios', soloDueno: false },
  { href: '/personal', texto: 'Personal', soloDueno: false },
  { href: '/planes', texto: 'Planes', soloDueno: true },
] as const;

/**
 * La cabecera y la navegacion del panel.
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

  return (
    <div className={estilos.marco}>
      <header className={estilos.cabecera}>
        <div className={estilos.fila}>
          <span className={estilos.marca}>GYMLAB</span>
          <span className={estilos.separador} aria-hidden="true">
            /
          </span>

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

          <div className={estilos.derecha}>
            <div className={estilos.persona}>
              <div className={estilos.nombre}>{yo.user.name}</div>
              {rol && <div className={estilos.rol}>{NOMBRE_DEL_ROL[rol]}</div>}
            </div>
            <Boton variante="sutil" onClick={() => void salir()}>
              Salir
            </Boton>
          </div>
        </div>

        <nav className={estilos.navegacion} aria-label="Secciones">
          {SECCIONES.filter((seccion) => !seccion.soloDueno || rol === 'owner').map((seccion) => {
            const activo = ruta === seccion.href || ruta.startsWith(`${seccion.href}/`);
            return (
              <Link
                key={seccion.href}
                href={seccion.href}
                className={`${estilos.enlace} ${activo ? estilos.activo : ''}`}
                aria-current={activo ? 'page' : undefined}
              >
                {seccion.texto}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className={estilos.contenido}>{children}</main>
    </div>
  );
}
