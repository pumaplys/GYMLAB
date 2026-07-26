// Configuracion ESLint (flat config) compartida por todo el monorepo.
// Se consume desde cada workspace con:
//   import base from '@gymlab/config/eslint/base.mjs';
//   export default [...base];

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['**/dist/**', '**/.next/**', '**/.turbo/**', '**/.expo/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  {
    // Archivos de configuracion de herramientas (babel, metro, jest...).
    // Son CommonJS y se ejecutan en Node, no en la app: sin esto, ESLint los
    // analiza como modulos ESM de navegador y marca `module`, `require` y
    // `__dirname` como identificadores no definidos.
    files: ['**/*.config.js', '**/*.config.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
