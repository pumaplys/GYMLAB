/**
 * Los iconos de la navegacion. Catorce, dibujados aqui.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE NO HAY LIBRERIA DE ICONOS.                                       │
 * │                                                                          │
 * │ Hacen falta CATORCE, todos para el mismo sitio —la navegacion— y todos   │
 * │ del mismo estilo. Una libreria trae dos mil, un arbol de dependencias y  │
 * │ un estilo que no es el nuestro, para resolver catorce trazos.            │
 * │                                                                          │
 * │ Y el coste de mantenerlos es cero: no crecen. Los destinos del producto  │
 * │ son los que son, y cuando aparezca uno nuevo se dibuja su icono aqui.    │
 * │ El dia que hagan falta cincuenta iconos en sitios distintos, esa es otra │
 * │ conversacion — y entonces se justifica la dependencia con datos.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Todos comparten rejilla de 24, trazo de 1.5 y `currentColor`, que es lo que
 * los hace un juego y no catorce dibujos: heredan el color del enlace, asi que
 * el destino activo se colorea solo.
 *
 * SIEMPRE `aria-hidden`. Un icono de navegacion no es informacion: al lado
 * siempre va su palabra. Un lector de pantalla que los anunciara leeria cada
 * destino dos veces.
 */
import type { ReactNode } from 'react';

export type NombreDeIcono =
  | 'socios'
  | 'personal'
  | 'planes'
  | 'accesos'
  | 'configuracion'
  | 'rutinas'
  | 'ejercicios'
  | 'inicio'
  | 'progreso'
  | 'carne'
  | 'pagos'
  | 'privacidad'
  | 'mas'
  | 'menu'
  | 'cerrar';

function Trazo({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="var(--icono)"
      height="var(--icono)"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const DIBUJOS: Record<NombreDeIcono, ReactNode> = {
  /* Dos personas: el listado de socios. */
  socios: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5c0-3 2.5-4.75 5.5-4.75s5.5 1.75 5.5 4.75" />
      <path d="M16.5 5.4a3.25 3.25 0 0 1 0 5.2" />
      <path d="M18 15.1c1.7.6 2.9 1.9 2.9 4.4" />
    </>
  ),
  /* Una tarjeta identificativa: quien trabaja aqui. */
  personal: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16.2c.5-1.2 1.6-1.9 3-1.9s2.5.7 3 1.9" />
      <path d="M15.5 10h3.2M15.5 13.5h3.2" />
    </>
  ),
  /* Una etiqueta de precio: los planes. */
  planes: (
    <>
      <path d="M11.6 3.6H19a1.4 1.4 0 0 1 1.4 1.4v7.4a1.4 1.4 0 0 1-.4 1l-7.6 7.6a1.4 1.4 0 0 1-2 0l-6.4-6.4a1.4 1.4 0 0 1 0-2l7.6-7.6a1.4 1.4 0 0 1 1-.4Z" />
      <circle cx="16.2" cy="7.8" r="1.3" />
    </>
  ),
  /* Las cuatro esquinas de un marco de escaneo. */
  accesos: (
    <>
      <path d="M3.5 8V5.5A2 2 0 0 1 5.5 3.5H8" />
      <path d="M16 3.5h2.5a2 2 0 0 1 2 2V8" />
      <path d="M20.5 16v2.5a2 2 0 0 1-2 2H16" />
      <path d="M8 20.5H5.5a2 2 0 0 1-2-2V16" />
      <path d="M3.5 12h17" />
    </>
  ),
  /* Reguladores: los ajustes del gimnasio. */
  configuracion: (
    <>
      <path d="M5 5.5v13M12 5.5v13M19 5.5v13" />
      <circle cx="5" cy="9" r="2" />
      <circle cx="12" cy="15" r="2" />
      <circle cx="19" cy="8" r="2" />
    </>
  ),
  /* Una lista con marcas: las rutinas. */
  rutinas: (
    <>
      <rect x="4.5" y="4" width="15" height="16" rx="2.5" />
      <path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h4" />
    </>
  ),
  /* Una mancuerna: la biblioteca de ejercicios. */
  ejercicios: (
    <>
      <path d="M4 9.5v5M7 7.5v9M17 7.5v9M20 9.5v5" />
      <path d="M7 12h10" />
    </>
  ),
  /* Una casa: el inicio del socio. */
  inicio: (
    <>
      <path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.6Z" />
      <path d="M9.5 20.5v-6h5v6" />
    </>
  ),
  /* Una linea que sube: el progreso. */
  progreso: (
    <>
      <path d="M4 19.5h16" />
      <path d="M5.5 15.5 10 11l3.2 3.2L19 8" />
      <path d="M15.6 8H19v3.4" />
    </>
  ),
  /* Un carne con su codigo. */
  carne: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <rect x="6.5" y="8.5" width="4.5" height="4.5" rx="1" />
      <path d="M6.5 16h4.5M14 9.5h4M14 12.5h4M14 15.5h2.5" />
    </>
  ),
  /* Un recibo: los pagos. */
  pagos: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6-2.1-1.6-2.2 1.6v-17Z" />
      <path d="M9 8.5h6M9 12h6" />
    </>
  ),
  /* Un escudo: la privacidad y el consentimiento. */
  privacidad: (
    <>
      <path d="M12 3.5 19 6v5.6c0 4-2.8 7.2-7 8.9-4.2-1.7-7-4.9-7-8.9V6l7-2.5Z" />
      <path d="M9.2 12.1 11.2 14l3.6-3.8" />
    </>
  ),
  /* Tres puntos: lo que no cabe en la barra. */
  mas: (
    <>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icono({ nombre }: { nombre: NombreDeIcono }) {
  return <Trazo>{DIBUJOS[nombre]}</Trazo>;
}
