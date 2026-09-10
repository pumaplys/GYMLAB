import { spawn } from 'node:child_process';

/**
 * METRO PARA LA APP NATIVA DE QA.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `EXPO_NO_METRO_WORKSPACE_ROOT=1` NO ES UN CAPRICHO: SIN EL, NO ARRANCA.  │
 * │                                                                          │
 * │ Por defecto Expo sirve desde la RAIZ del monorepo y le pide al cliente   │
 * │ `/apps/mobile/node_modules/expo-router/entry.bundle`. Metro resuelve esa │
 * │ ruta desde la raiz, y ahi no ve nada de lo que pnpm ha enlazado dentro   │
 * │ de `apps/mobile/node_modules`: ni `expo-router`, ni `@babel/runtime`.    │
 * │ El cliente de desarrollo recibe un 404 y se cae al abrirse.              │
 * │                                                                          │
 * │ Con esta variable, la raiz del servidor pasa a ser la de la app y todo   │
 * │ se resuelve igual que en `expo export`, que siempre habia funcionado.    │
 * │ Esa es la pista que lo delataba: exportar iba, servir no.                │
 * │                                                                          │
 * │ Solo afecta al servidor de desarrollo local. EAS no lo usa.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La API apunta a `localhost:3001`, que llega a la maquina por
 * `adb reverse tcp:3001 tcp:3001`. En una build de RELEASE esa URL la
 * rechazaria `esDeDesarrollo`; aqui vale porque el cliente de desarrollo
 * corre con `__DEV__`.
 *
 *   node herramientas/desarrollo/metro.mjs
 */
const hijo = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'start', '--dev-client', '--port', '8081', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      EXPO_NO_METRO_WORKSPACE_ROOT: '1',
      EXPO_PUBLIC_API_URL: 'http://localhost:3001/v1',
    },
  },
);

hijo.on('exit', (codigo) => process.exit(codigo ?? 0));
