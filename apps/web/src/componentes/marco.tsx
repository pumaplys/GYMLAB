'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Armazon } from '@/componentes/armazon';
import { useSesion } from '@/lib/sesion';
import estilos from './marco.module.css';

/**
 * Los destinos del panel de gimnasio. La lista es el sitio donde crece.
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
 * El marco del PANEL DE GIMNASIO: contexto arriba, destinos debajo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES EL MARCO DE UN AREA, NO EL DE LA APLICACION.                          │
 * │                                                                          │
 * │ Antes tambien pintaba el contexto y el esqueleto; ahora eso vive en      │
 * │ `Armazon` y `BandaDeContexto`, que comparten las tres areas. Lo que      │
 * │ queda aqui es lo unico que es del panel: su fila de destinos.            │
 * │                                                                          │
 * │ El area de entrenador y la de socio tienen su propio marco y pueden      │
 * │ evolucionar sin tocar este — que es justo lo que se queria: el           │
 * │ entrenador es una herramienta de trabajo y el socio sera movil.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE NO HAY BARRA LATERAL
 *
 * Medido en el navegador a 1024 px, que es un portatil corriente: una columna
 * de 240 px deja los tres destinos ocupando 109 px de 800 de alto —el 86 % de
 * la columna vacia— y le quita 240 px al contenido, con lo que la tabla de
 * socios baja de 974 a 734 px. Para recepcion, que solo ve dos destinos, la
 * columna se queda en el 9 % ocupada. Cuando los destinos crezcan, la barra
 * lateral se gana el sitio; hoy no.
 *
 * Se pinta solo dentro de `RutaPrivada`, asi que aqui ya hay sesion y gimnasio
 * activo. Si algo de eso faltara seria un error de composicion, no un estado
 * que haya que dibujar.
 */
export function Marco({ children }: { children: ReactNode }) {
  const { rol } = useSesion();
  const ruta = usePathname();

  const visibles = DESTINOS.filter((destino) => !destino.soloDueno || rol === 'owner');

  return (
    <Armazon
      navegacion={
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
      }
    >
      {children}
    </Armazon>
  );
}
