import { defineConfig } from 'vitest/config';

/**
 * Vitest, que es lo que ya usa el monorepo (api, db, api-client y web).
 *
 * Se prueba SOLO logica pura: el fetch autenticado y la maquina de estados de
 * sesion. Nada que necesite renderizar React Native, y por eso no hace falta
 * ni jest-expo, ni react-test-renderer, ni un entorno de pruebas nativo.
 *
 * Cuando haya pantallas que merezca la pena probar renderizadas, esa decision
 * se toma entonces y con motivo. Montar hoy la infraestructura para probar un
 * `<View>` seria pagar por adelantado.
 */
export default defineConfig({
  /*
   * `__DEV__` lo define React Native, no Node. Aqui se fija a `false` —las
   * pruebas corren con la semantica de un build de RELEASE— porque es el lado
   * en el que un fallo se paga: en desarrollo se ve al momento, en release se
   * descubre con la app instalada.
   */
  define: { __DEV__: 'false' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
