import type { ReactNode } from 'react';
import Link from 'next/link';
import estilos from './lista-apilada.module.css';

/**
 * Los listados del panel cuando la pantalla es estrecha.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUE COMPARTEN LAS CINCO TABLAS, Y QUE NO.                                │
 * │                                                                          │
 * │ Socios, personal, invitaciones, planes y pagos tienen la misma forma:    │
 * │ un identificador, a veces una etiqueta de estado, unos cuantos pares     │
 * │ dato/valor y a veces acciones. Eso es lo que hay aqui.                   │
 * │                                                                          │
 * │ Lo que NO comparten es lo unico que cambia la semantica: en socios la    │
 * │ fila entera abre una ficha y en las otras cuatro no. Y esa diferencia    │
 * │ no puede ser una convencion que alguien recuerde — un `<a>` con botones │
 * │ dentro es HTML invalido, y una tarjeta que parece pulsable y no lo es    │
 * │ es peor que una fea. Por eso `href` y `acciones` se excluyen EN EL TIPO: │
 * │ pasar los dos no compila.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Va con `<ul>` y `<li>` a proposito: un lector de pantalla anuncia "lista, 12
 * elementos" y se puede saltar de uno a otro, que es lo que la tabla daba y no
 * hay que perder al dejar de ser tabla.
 */
export function ListaApilada({ children, etiqueta }: { children: ReactNode; etiqueta: string }) {
  return (
    <ul className={estilos.lista} aria-label={etiqueta}>
      {children}
    </ul>
  );
}

interface Comun {
  /** El identificador de la fila: el nombre, el correo, el concepto. */
  titulo: ReactNode;
  /** La pastilla de estado, si la fila tiene una. */
  etiqueta?: ReactNode;
  /** Los pares dato/valor, con `<Dato>`. */
  children?: ReactNode;
}

/** Toda la fila abre algo. Por eso no puede llevar controles dentro. */
interface Navegable extends Comun {
  href: string;
  acciones?: never;
}

/** La fila no lleva a ningun sitio; lo pulsable son sus botones. */
interface ConAcciones extends Comun {
  href?: never;
  acciones?: ReactNode;
}

export function FilaApilada({ titulo, etiqueta, children, ...resto }: Navegable | ConAcciones) {
  const cabecera = (
    <>
      <span className={estilos.titulo}>{titulo}</span>
      {etiqueta}
    </>
  );

  return (
    <li className={estilos.fila}>
      {'href' in resto && resto.href !== undefined ? (
        // El enlace envuelve la fila ENTERA —cabecera y datos— para que el area
        // pulsable sea toda la tarjeta y no solo el nombre. Con `display: block`
        // el objetivo tactil pasa de una linea de texto a un bloque de 100 px.
        <Link href={resto.href} className={estilos.enlace}>
          <span className={estilos.cabecera}>{cabecera}</span>
          {children && <dl className={estilos.datos}>{children}</dl>}
        </Link>
      ) : (
        <>
          <div className={estilos.cabecera}>{cabecera}</div>
          {children && <dl className={estilos.datos}>{children}</dl>}
          {'acciones' in resto && resto.acciones && (
            <div className={estilos.acciones}>{resto.acciones}</div>
          )}
        </>
      )}
    </li>
  );
}

/**
 * Un par dato/valor dentro de una fila apilada.
 *
 * `<dt>`/`<dd>` y no dos `<span>`: es lo que ata el nombre del dato con su
 * valor para un lector de pantalla. Sin eso, una tarjeta se lee como una
 * retahila de palabras sueltas y hay que adivinar cual es el telefono.
 */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <dt className={estilos.nombreDelDato}>{etiqueta}</dt>
      <dd className={estilos.valor}>{children}</dd>
    </>
  );
}
