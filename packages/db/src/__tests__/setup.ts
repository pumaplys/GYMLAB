import { join } from 'node:path';
import { config } from 'dotenv';

// El .env vive en la raiz del monorepo.
config({ path: join(__dirname, '../../../../.env') });
