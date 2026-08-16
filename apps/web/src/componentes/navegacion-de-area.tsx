'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import estilos from './navegacion-de-area.module.css';

export interface Destino {
  href: string;
  texto: string;
}

/**
 * La fila de destinos de un area. La comparten el panel y el entrenador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ GANA EL PREFIJO MAS LARGO, Y ASI NO HAY CASOS ESPECIALES.                │
 * │                                                                          │
 * │ La regla anterior —"activo si la ruta empieza por su href"— se rompe en  │
 * │ cuanto un area tiene indice y subsecciones: con `/entrenador`,           │
 * │ `/entrenador/rutinas` y `/entrenador/ejercicios`, estando en rutinas se  │
 * │ marcarian DOS destinos, porque todo empieza por `/entrenador`.           │
 * │                                                                          │
 * │ La salida no es una bandera `exacto` en cada destino —que hay que        │
 * │ acordarse de poner, y nadie se acuerda— sino elegir el que mas coincide: │
 * │                                                                          │
 * │   /entrenador/rutinas/ficha  ->  Rutinas   (mas largo que /entrenador)   │
 * │   /entrenador/socio          ->  Mis socios                              │
 * │   /socios/ficha              ->  Socios                                  │
 * │                                                                          │
 * │ Funciona igual para el panel sin tocarlo, y una subseccion nueva no      │
 * │ obliga a revisar esta logica.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function NavegacionDeArea({ destinos }: { destinos: readonly Destino[] }) {
  const ruta = usePathname();

  const activo = destinos.reduce<string | null>((mejor, destino) => {
    const coincide = ruta === destino.href || ruta.startsWith(`${destino.href}/`);
    if (!coincide) return mejor;
    return mejor === null || destino.href.length > mejor.length ? destino.href : mejor;
  }, null);

  return (
    <nav className={estilos.destinos} aria-label="Secciones">
      {destinos.map((destino) => {
        const esteEsElActivo = destino.href === activo;
        return (
          <Link
            key={destino.href}
            href={destino.href}
            className={`${estilos.enlace} ${esteEsElActivo ? estilos.activo : ''}`}
            aria-current={esteEsElActivo ? 'page' : undefined}
          >
            {destino.texto}
          </Link>
        );
      })}
    </nav>
  );
}
