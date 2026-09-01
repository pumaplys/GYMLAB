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

function resolver(): string {
  const declarada = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (declarada) return declarada.replace(/\/+$/, '');
  return __DEV__ ? DESARROLLO_POR_DEFECTO : PRODUCCION;
}

export const API_URL = resolver();
