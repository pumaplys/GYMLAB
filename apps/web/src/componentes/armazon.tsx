'use client';

import type { ReactNode } from 'react';
import { BandaDeContexto } from '@/componentes/banda-de-contexto';
import estilos from './armazon.module.css';

/**
 * El esqueleto que comparten las tres areas: salto al contenido, cabecera
 * pegajosa con el contexto, y el `main` donde va todo lo demas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ COMPARTE EL ESQUELETO, NO EL LAYOUT.                                     │
 * │                                                                          │
 * │ Lo que se repite en las tres es lo que nadie quiere escribir tres veces: │
 * │ el enlace de salto —con su `:focus` y su `tabIndex={-1}` en el main—, la │
 * │ cabecera que se queda arriba y el ancho centrado. Eso vive aqui.         │
 * │                                                                          │
 * │ Lo que NO se comparte es lo que cada area pone debajo del contexto: el   │
 * │ panel una fila de destinos, el entrenador todavia nada y el socio otra   │
 * │ cosa. Por eso `navegacion` es un hueco y no una bandera: este componente │
 * │ no sabe cuantas areas hay ni cual esta pintando.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Armazon({
  navegacion,
  ancho = 'trabajo',
  children,
}: {
  /** Lo que va debajo del contexto, separado por un filete. Opcional. */
  navegacion?: ReactNode;
  /**
   * `trabajo` para listados y herramientas; `lectura` para una columna sola.
   *
   * Son los dos anchos del sistema visual, no dos valores nuevos: 72rem y
   * 44rem. El area de socio usa `lectura` porque es mobile-first y en
   * escritorio una columna estrecha se lee mejor que una pantalla vacia.
   */
  ancho?: 'trabajo' | 'lectura';
  children: ReactNode;
}) {
  return (
    <div className={estilos.armazon}>
      {/*
        Con la navegacion arriba, quien usa teclado tabula por la marca, el
        gimnasio y los destinos antes de llegar al contenido — en cada pantalla.
        El salto lo evita, y solo aparece cuando se le da el foco.
      */}
      <a href="#contenido" className={estilos.salto}>
        Saltar al contenido
      </a>

      <header className={estilos.cabecera}>
        <BandaDeContexto />
        {navegacion && <div className={estilos.banda}>{navegacion}</div>}
      </header>

      {/*
        `tabIndex={-1}` para que el salto pueda dejar el foco aqui: sin el, el
        navegador mueve la vista pero el foco sigue en la cabecera y el
        siguiente tabulador vuelve a la navegacion.
      */}
      <main
        id="contenido"
        tabIndex={-1}
        className={`${estilos.contenido} ${ancho === 'lectura' ? estilos.lectura : ''}`.trim()}
      >
        {children}
      </main>
    </div>
  );
}
