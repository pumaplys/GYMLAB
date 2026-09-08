import base from '@gymlab/config/eslint/base.mjs';

export default [
  ...base,
  {
    /*
     * `herramientas/` son guiones de Node, no codigo de la app: se ejecutan en
     * el ordenador de quien desarrolla y nunca viajan en el paquete. Sin esto,
     * ESLint los analiza como modulos de navegador y marca `process` y
     * `console` como identificadores no definidos.
     *
     * Van aparte del bloque de `*.config.js` de la base porque aquellos son
     * CommonJS y estos son ESM.
     */
    files: ['herramientas/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        // El gate de aislamiento lee el bytecode de Hermes en crudo.
        Buffer: 'readonly',
      },
    },
  },
];
