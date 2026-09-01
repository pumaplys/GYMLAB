import type { ReactNode } from 'react';
import { ContextoDeSesion, ProveedorDeSesion, type Sesion } from '../auth/sesion';
import { ApiError } from '@gymlab/api-client';
import { CASOS } from './casos';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA VISUAL. SOLO WEB, Y SOLO CON LA VARIABLE PUESTA.           │
 * │                                                                          │
 * │ Sirve para MIRAR las pantallas mientras la validacion en iPhone sigue    │
 * │ bloqueada. Se activa poniendo `?vista=<caso>` en la URL:                 │
 * │                                                                          │
 * │   /entrar?vista=login            /inicio?vista=autenticado               │
 * │   /entrar?vista=login-error      /elegir-gimnasio?vista=selector-varios  │
 * │                                                                          │
 * │ Lo unico que cambia es el VALOR del contexto de sesion. Las pantallas,   │
 * │ la barra de pestañas y el gate son los de verdad: no hay una segunda     │
 * │ copia que pueda divergir. Sin `?vista=`, esto es el proveedor normal.    │
 * │                                                                          │
 * │ TRES CERROJOS, y el tercero es el que de verdad importa:                 │
 * │   1. hace falta `?vista=` en la URL;                                     │
 * │   2. hace falta EXPO_PUBLIC_VISTA_PREVIA=1, que no existe en un build    │
 * │      de tienda;                                                          │
 * │   3. este fichero es `.web.tsx`: en iOS y Android Metro coge el otro y   │
 * │      nada de esto —ni los datos— llega al binario.                       │
 * │                                                                          │
 * │ Nada de aqui toca el token, SecureStore, la red ni switchGym: las        │
 * │ funciones de sesion son inertes a proposito.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

export function ProveedorRaiz({ children }: { children: ReactNode }) {
  const sesion = HABILITADA ? sesionDeMuestra() : null;
  if (!sesion) return <ProveedorDeSesion>{children}</ProveedorDeSesion>;
  return <ContextoDeSesion.Provider value={sesion}>{children}</ContextoDeSesion.Provider>;
}

function sesionDeMuestra(): Sesion | null {
  const nombre = new URLSearchParams(window.location.search).get('vista');
  const caso = nombre ? CASOS[nombre] : undefined;
  if (!caso) return null;

  const inerte = async () => undefined;

  /*
   * `entrar` es lo unico que hace algo, y solo para poder ver dos estados que
   * viven DENTRO de la pantalla de login y no en el contexto: el error y la
   * espera. Se provocan por el camino de verdad —escribiendo y pulsando— asi
   * que el mensaje que sale lo genera `mensajeDeEntrada`, no esta escrito a
   * mano en ningun sitio.
   */
  const entrar =
    caso.entrada === 'falla401'
      ? async () => {
          throw new ApiError(401, 'Unauthorized');
        }
      : caso.entrada === 'nunca-termina'
        ? () => new Promise<void>(() => undefined)
        : inerte;

  return { estado: caso.estado, entrar, salir: inerte, elegirGimnasio: inerte, revisar: inerte };
}
