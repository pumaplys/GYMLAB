import base from '@gymlab/config/eslint/base.mjs';

export default [
  ...base,
  {
    rules: {
      // Desactivada a proposito en la API, no por comodidad.
      //
      // NestJS resuelve la inyeccion de dependencias leyendo la metadata que
      // emite `emitDecoratorMetadata` a partir de los tipos de los parametros
      // del constructor. Si esta regla convierte uno de esos imports en
      // `import type`, el tipo desaparece del JavaScript emitido y la DI falla
      // **en ejecucion**, no al compilar.
      //
      // Es decir: aplicar el --fix de esta regla puede romper la aplicacion sin
      // que ningun test de tipos lo detecte. En los paquetes sin decoradores
      // (contracts, db) la regla sigue activa.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
