/**
 * A que API habla la app.
 *
 * `EXPO_PUBLIC_API_URL` ya existia en `.env.example` del monorepo desde antes
 * de que hubiera app: se reutiliza en lugar de inventar otro nombre.
 *
 * Las variables `EXPO_PUBLIC_*` las INCRUSTA el bundler en el paquete, asi que
 * cualquiera que descargue la app puede leerlas. La URL de la API no es un
 * secreto —esta en cada peticion que hace el panel web— pero por eso mismo
 * aqui no puede ir nada que si lo sea.
 *
 * En desarrollo, `localhost` no vale desde un telefono: el movil no es el
 * ordenador. Con Expo Go hay que apuntar a la IP de la maquina en la red
 * local, y eso depende de la red, asi que se deja en manos de la variable en
 * lugar de adivinarlo.
 */
const PRODUCCION = 'https://gymlabfit.tech/v1';

/**
 * `__DEV__` lo define React Native: `true` con el bundler de desarrollo,
 * `false` en un build de release.
 */
const DESARROLLO_POR_DEFECTO = 'http://localhost:3001/v1';

/**
 * Si una URL solo puede servir para desarrollar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA IP DE LA RED LOCAL NO PUEDE VIAJAR EN UN BUILD DE RELEASE.          │
 * │                                                                          │
 * │ `.env` de este repositorio apunta a la IP del PC en la red de casa,      │
 * │ porque es lo unico que funciona desde un telefono con Expo Go. Y         │
 * │ `expo export` carga ese `.env` TAMBIEN cuando compila para produccion:   │
 * │ se comprobo mirando el paquete, y la IP estaba dentro.                   │
 * │                                                                          │
 * │ Un telefono fuera de esa red no llega a 192.168.x.x. La app no fallaria  │
 * │ con un mensaje claro: se quedaria esperando hasta agotar el tiempo, una  │
 * │ y otra vez, y quien la instale pensaria que la app no funciona.          │
 * │                                                                          │
 * │ Asi que en release una URL de desarrollo NO se usa. Ni http, ni          │
 * │ localhost, ni IP privada. Se cae al dominio de produccion, que es el     │
 * │ unico sitio al que puede llegar cualquier telefono.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Es logica pura y se prueba como tal: `esDeDesarrollo` no mira `__DEV__`.
 */
export function esDeDesarrollo(url: string): boolean {
  let host: string;
  let protocolo: string;
  try {
    const partes = new URL(url);
    host = partes.hostname;
    protocolo = partes.protocol;
  } catch {
    // Lo que ni siquiera es una URL tampoco sirve para hablar con la API.
    return true;
  }

  if (protocolo !== 'https:') return true;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  // Las tres franjas privadas de IPv4 (RFC 1918), la de enlace local y ::1.
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return true;
  if (host === '::1' || host === '[::1]') return true;
  return false;
}

function resolver(): string {
  const declarada = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!declarada) return __DEV__ ? DESARROLLO_POR_DEFECTO : PRODUCCION;

  const limpia = declarada.replace(/\/+$/, '');
  if (__DEV__) return limpia;
  return esDeDesarrollo(limpia) ? PRODUCCION : limpia;
}

export const API_URL = resolver();
