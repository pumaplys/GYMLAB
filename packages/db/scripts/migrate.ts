/**
 * `pnpm db:migrate` en desarrollo.
 *
 * Solo carga el `.env` de la raiz y delega en `src/deploy-cli.ts`, que es
 * EXACTAMENTE el codigo que corre en el despliegue. En produccion no hay
 * fichero `.env` —las variables llegan del entorno— y por eso esa parte vive
 * aqui y no alli.
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

await import('../src/deploy-cli.js');
