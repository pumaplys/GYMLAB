import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * La pasada que EJECUTA DE VERDAD las tres acciones destructivas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ APARTE DE `pnpm test` A PROPOSITO.                                       │
 * │                                                                          │
 * │ Necesita la API y PostgreSQL de desarrollo levantados, y escribe en la   │
 * │ base. Eso no puede colarse en la suite que corre en cada rama: se lanza  │
 * │ a mano, con `pnpm --filter @gymlab/mobile destructivas`, y su cerrojo    │
 * │ aborta si el destino no es exactamente el de desarrollo.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default defineConfig({
  /*
   * `true`, al reves que en `vitest.config.ts`. Y no es un descuido: es la
   * unica forma de reproducir lo que hace el telefono EN DESARROLLO, que es
   * donde se prueba. Con `__DEV__` a `false`, `src/api/config.ts` rechazaria
   * `http://localhost:3001/v1` por ser de desarrollo y caeria en PRODUCCION —
   * exactamente el fallo del 2026-09-07. El cerrojo lo comprueba igualmente.
   */
  define: { __DEV__: 'true' },
  resolve: {
    alias: {
      // El Keychain no existe fuera del telefono. Es el unico doble.
      'expo-secure-store': fileURLToPath(
        new URL('./herramientas/desarrollo/llavero-en-memoria.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['herramientas/desarrollo/**/*.test.ts'],
    env: { EXPO_PUBLIC_API_URL: 'http://localhost:3001/v1' },
    // Un unico hilo: el fixture es compartido y las acciones se encadenan.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
