import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Pruebas del panel web.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO LOGICA PURA, Y NO ES UNA LIMITACION TEMPORAL.                       │
 * │                                                                          │
 * │ Lo que hay que probar aqui son DECISIONES: a que area va cada rol, que   │
 * │ pasa si alguien escribe a mano la URL de otra, y a donde se le lleva. Y  │
 * │ todo eso se escribio como funciones puras en `lib/areas.ts` justamente   │
 * │ para que se pueda comprobar sin navegador, sin sesion y sin React.       │
 * │                                                                          │
 * │ Montar un DOM para preguntarle a un componente lo que ya responde una    │
 * │ funcion seria mas lento y probaria menos: la parte fragil no es como se  │
 * │ pinta una redireccion, es que la decision sea la correcta.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
