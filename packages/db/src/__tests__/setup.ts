import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// El .env vive en la raiz del monorepo.
//
// Se resuelve con import.meta.url y no con __dirname porque @gymlab/db es
// "type": "module": en ESM, __dirname no existe. El typecheck no lo detecta
// (@types/node lo declara igualmente), pero fallaria en ejecucion.
config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });
