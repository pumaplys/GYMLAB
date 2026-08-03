import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import estilos from './boton.module.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario' | 'sutil';
  /** Deshabilita y anuncia que hay algo en marcha. */
  cargando?: boolean;
  bloque?: boolean;
  children: ReactNode;
}

export function Boton({
  variante = 'secundario',
  cargando = false,
  bloque = false,
  disabled,
  className,
  children,
  ...resto
}: Props) {
  return (
    <button
      // `type="button"` por defecto: dentro de un formulario, el defecto del
      // HTML es "submit", y un boton auxiliar que envie el formulario sin
      // querer es de los fallos que nadie reproduce despues.
      type="button"
      disabled={disabled ?? cargando}
      aria-busy={cargando || undefined}
      className={[estilos.boton, estilos[variante], bloque ? estilos.bloque : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...resto}
    >
      {cargando && <span className={estilos.girando} aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * Con aspecto de boton, pero es un enlace.
 *
 * Existe porque lo contrario —meter un `<button>` dentro de un `<a>`— es HTML
 * invalido y deja el elemento sin significado para un lector de pantalla. Si
 * lleva a otro sitio es un enlace, aunque se pinte como un boton: asi se puede
 * abrir en otra pestana y el navegador sabe que es navegacion.
 */
export function BotonEnlace({
  href,
  variante = 'secundario',
  children,
}: {
  href: string;
  variante?: 'primario' | 'secundario' | 'sutil';
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${estilos.boton} ${estilos[variante]}`}>
      {children}
    </Link>
  );
}
