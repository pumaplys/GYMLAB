import type { ReactNode } from 'react';
import estilos from './pantalla-centrada.module.css';

interface Props {
  titulo: string;
  entradilla?: ReactNode;
  /** Ancho de la tarjeta. `ancha` para listas, como la de gimnasios. */
  ancha?: boolean;
  /** Opcional: hay callejones sin salida donde no queda nada que ofrecer. */
  children?: ReactNode;
}

/**
 * Las pantallas que ocupan la ventana entera y no llevan navegacion: entrar,
 * elegir gimnasio, y los callejones sin salida (sin permiso, sin gimnasios).
 *
 * Van sin cabecera a proposito. En todas ellas no hay a donde ir todavia, y una
 * barra con secciones que no se pueden abrir invita a probarlas.
 */
export function PantallaCentrada({ titulo, entradilla, ancha = false, children }: Props) {
  return (
    <main className={estilos.pantalla}>
      <div className={estilos.tarjeta} style={ancha ? { maxWidth: '32rem' } : undefined}>
        <p className={estilos.marca}>GYMLAB</p>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {entradilla && <p className={estilos.entradilla}>{entradilla}</p>}
        {children}
      </div>
    </main>
  );
}
