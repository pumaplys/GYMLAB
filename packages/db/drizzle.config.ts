import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// El .env vive en la raiz del monorepo, no en este paquete.
config({ path: '../../.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Deja constancia en el log de que las politicas RLS viven en migraciones
  // escritas a mano dentro de ./migrations/manual (ver README del paquete).
  verbose: true,
  strict: true,
});
