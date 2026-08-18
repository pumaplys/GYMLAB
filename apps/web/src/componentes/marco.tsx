'use client';

import type { ReactNode } from 'react';
import { Armazon } from '@/componentes/armazon';
import { NavegacionDeArea, type Destino } from '@/componentes/navegacion-de-area';
import { useSesion } from '@/lib/sesion';

/**
 * Los destinos del panel de gimnasio. La lista es el sitio donde crece.
 *
 * Son CINCO, y son los que existen: `/socios`, `/personal`, `/planes`, `/accesos`
 * y `/configuracion`. No hay panel de inicio, ni entrenadores, ni rutinas — y
 * mientras no los haya no se anuncian aqui. Un enlace que lleva a un 404 cuesta
 * mas confianza de la que ahorra tenerlo preparado.
 *
 * `soloDueno` no protege nada —la autorizacion la impone el servidor— sino que
 * evita ofrecer un destino que responderia "esta seccion no es para tu rol".
 * Los precios son decision del dueno; el mostrador solo los consulta al cobrar.
 * Y la identidad juridica con la que se publica el documento de privacidad no
 * es un dato de contacto mas: la cambia quien responde por ella.
 */
const DESTINOS = [
  { href: '/socios', texto: 'Socios', soloDueno: false },
  { href: '/personal', texto: 'Personal', soloDueno: false },
  { href: '/planes', texto: 'Planes', soloDueno: true },
  { href: '/accesos', texto: 'Accesos', soloDueno: false },
  { href: '/configuracion', texto: 'Configuración', soloDueno: true },
] as const;

/**
 * El marco del PANEL DE GIMNASIO: contexto arriba, destinos debajo.
 *
 * Es el marco de un AREA, no el de la aplicacion. El esqueleto vive en
 * `Armazon`, el contexto en `BandaDeContexto` y la fila de destinos en
 * `NavegacionDeArea` — las tres las comparten las tres areas. Lo que queda aqui
 * es lo unico que es del panel: QUE destinos tiene y quien los ve.
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

  const visibles: Destino[] = DESTINOS.filter(
    (destino) => !destino.soloDueno || rol === 'owner',
  ).map(({ href, texto }) => ({ href, texto }));

  return <Armazon navegacion={<NavegacionDeArea destinos={visibles} />}>{children}</Armazon>;
}
