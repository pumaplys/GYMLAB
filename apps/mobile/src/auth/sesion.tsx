/**
 * El proveedor de sesion. La parte que habla con React, la red y el almacen.
 *
 * Toda la POLITICA vive en `estado.ts` y se prueba sin montar nada; aqui solo
 * queda la fontaneria: leer el token, preguntar al servidor, guardar y borrar.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoginInput } from '@gymlab/contracts';
import { api } from '../api/cliente';
import { borrarToken, guardarToken, leerToken } from './almacen';
import { debeBorrarToken, decidirEstado, type EstadoDeSesion, type Resultado } from './estado';

interface Sesion {
  estado: EstadoDeSesion;
  entrar: (credenciales: LoginInput) => Promise<void>;
  salir: () => Promise<void>;
  /** Para reintentar tras un fallo de red sin reiniciar la app. */
  revisar: () => Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

/**
 * Un 401 llega como error del cliente; cualquier otro fallo, como caida de red.
 *
 * Se mira el `status` si existe: `@gymlab/api-client` tipa sus errores de API,
 * y lo que NO es un error de API —un `TypeError` de `fetch`— es que no se pudo
 * llegar al servidor.
 */
function clasificar(problema: unknown): Resultado {
  const status = (problema as { status?: number } | null)?.status;
  if (status === 401) return { clase: 'noAutorizado' };
  if (typeof status === 'number') return { clase: 'noAutorizado' };
  return { clase: 'errorDeRed' };
}

export function ProveedorDeSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDeSesion>({ tipo: 'cargando' });

  const resolver = useCallback(async () => {
    setEstado({ tipo: 'cargando' });

    const token = await leerToken();
    if (!token) {
      setEstado(decidirEstado({ clase: 'sinToken' }));
      return;
    }

    let resultado: Resultado;
    try {
      resultado = { clase: 'yo', yo: await api.auth.me() };
    } catch (problema) {
      resultado = clasificar(problema);
    }

    if (debeBorrarToken(resultado)) await borrarToken();
    setEstado(decidirEstado(resultado));
  }, []);

  useEffect(() => {
    void resolver();
  }, [resolver]);

  const entrar = useCallback(
    async (credenciales: LoginInput) => {
      // El token viaja en el CUERPO de la respuesta, tipado por el contrato.
      // Ver el comentario de cabecera de `api/cliente.ts`.
      const sesion = await api.auth.login(credenciales);
      await guardarToken(sesion.token);
      await resolver();
    },
    [resolver],
  );

  const salir = useCallback(async () => {
    // Se avisa al servidor para que invalide la sesion, pero el borrado local
    // ocurre pase lo que pase: si no hay red, la app tiene que poder cerrarse
    // igual. La sesion del servidor caducara por su cuenta.
    try {
      await api.auth.logout();
    } catch {
      // Sin conexion tambien se sale.
    }
    await borrarToken();
    setEstado({ tipo: 'sinSesion' });
  }, []);

  const valor = useMemo(
    () => ({ estado, entrar, salir, revisar: resolver }),
    [estado, entrar, salir, resolver],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion se ha usado fuera de <ProveedorDeSesion>.');
  return valor;
}
