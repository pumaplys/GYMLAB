'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoginInput, Me, Role } from '@gymlab/contracts';
import { ApiError } from '@gymlab/api-client';
import { api } from '@/lib/api';

/**
 * La sesion del panel.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE GUARDA NINGUN TOKEN, Y ES LO IMPORTANTE.                      │
 * │                                                                          │
 * │ La sesion vive en una cookie `httpOnly` que este codigo NO PUEDE LEER.   │
 * │ Esa es justamente su virtud: un XSS en cualquier dependencia tampoco     │
 * │ puede. La diferencia entre "robaron la sesion" y "no pudieron".          │
 * │                                                                          │
 * │ Consecuencia: no hay forma de saber si hay sesion sin preguntar al       │
 * │ servidor. Lo que este estado guarda no es la sesion, es la ULTIMA        │
 * │ RESPUESTA del servidor sobre ella.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type EstadoSesion =
  /** Aun no sabemos: hay un `me()` en vuelo. Es el estado inicial. */
  | { fase: 'cargando' }
  /** El servidor dice que no hay sesion. */
  | { fase: 'anonimo' }
  /** Hay sesion, y esto es lo que el servidor sabe de ella. */
  | { fase: 'identificado'; yo: Me }
  /**
   * No hubo respuesta. Es un estado propio y no "anonimo" a proposito: mandar a
   * la pantalla de entrar a quien se ha quedado sin red le haria intentar
   * entrar, fallar otra vez y no entender por que. Aqui se dice lo que pasa y
   * se ofrece reintentar.
   */
  | { fase: 'incomunicado' };

interface Sesion {
  estado: EstadoSesion;
  /**
   * Rol en el gimnasio activo, o null si no hay ninguno activo.
   *
   * Sirve para no pintar secciones que la API va a rechazar. NO es la
   * autorizacion: esa vive en el servidor y no se puede mover aqui.
   */
  rol: Role | null;
  /** El gimnasio activo de la sesion, que decide el servidor, no la URL. */
  gymId: string | null;
  entrar(credenciales: LoginInput): Promise<void>;
  salir(): Promise<void>;
  elegirGimnasio(gymId: string): Promise<void>;
  /** Vuelve a preguntar al servidor. Es lo que se hace ante un 401. */
  revisar(): Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ fase: 'cargando' });

  const revisar = useCallback(async () => {
    try {
      setEstado({ fase: 'identificado', yo: await api.auth.me() });
    } catch (error) {
      // 401 es la respuesta normal a "no hay sesion", no una incidencia.
      if (error instanceof ApiError) setEstado({ fase: 'anonimo' });
      else setEstado({ fase: 'incomunicado' });
    }
  }, []);

  // Al abrir el panel no sabemos nada: se pregunta.
  useEffect(() => {
    void revisar();
  }, [revisar]);

  const valor = useMemo<Sesion>(() => {
    const yo = estado.fase === 'identificado' ? estado.yo : null;
    const gymId = yo?.activeGymId ?? null;

    return {
      estado,
      gymId,
      rol: yo?.memberships.find((m) => m.gymId === gymId)?.role ?? null,

      async entrar(credenciales) {
        // El login solo devuelve el gimnasio activo; el resto —nombre, rol,
        // gimnasios— vive en `me()`. Se piden los dos para no dejar la pantalla
        // a medias con datos que aun no tenemos.
        await api.auth.login(credenciales);
        setEstado({ fase: 'identificado', yo: await api.auth.me() });
      },

      async salir() {
        try {
          await api.auth.logout();
        } finally {
          // Pase lo que pase, aqui se deja de creer que hay sesion. Si el
          // servidor no llego a enterarse, la cookie sigue viva pero la persona
          // ya no esta dentro; lo contrario —quedarse dentro tras pulsar
          // "salir" porque fallo la red— seria mucho peor.
          setEstado({ fase: 'anonimo' });
        }
      },

      async elegirGimnasio(destino) {
        await api.auth.switchGym({ gymId: destino });
        // No se parchea el estado con el gimnasio elegido: se vuelve a
        // preguntar. El servidor tambien recalcula el rol al cambiar de
        // gimnasio, y suponerlo aqui es como acaban desincronizandose.
        await revisar();
      },

      revisar,
    };
  }, [estado, revisar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const sesion = useContext(Contexto);
  if (!sesion) throw new Error('useSesion se ha usado fuera de <ProveedorSesion>.');
  return sesion;
}

/**
 * ¿Este error dice que la sesion ya no vale?
 *
 * Una sesion de recepcion caduca dentro de la jornada, asi que esto pasa a
 * diario y en mitad de cualquier pantalla.
 */
export function esSesionCaducada(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
