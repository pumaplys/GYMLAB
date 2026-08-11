import estilos from './cargando.module.css';

/**
 * Mientras se pide algo al servidor.
 *
 * `role="status"` y `aria-live="polite"` para que un lector de pantalla anuncie
 * que se esta esperando, sin interrumpir lo que estuviera leyendo. Sin eso, a
 * quien no ve la pantalla el panel se le queda en silencio.
 *
 * Texto y no un girador animado: decir «Cargando los planes…» informa de que se
 * esta cargando Y de que. Y no hay nada que animar con
 * `prefers-reduced-motion`.
 */
export function Cargando({ children }: { children: string }) {
  return (
    <p className={estilos.cargando} role="status" aria-live="polite">
      {children}
    </p>
  );
}
