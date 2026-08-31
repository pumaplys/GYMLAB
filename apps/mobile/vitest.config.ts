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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
