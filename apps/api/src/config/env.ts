import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

// El .env vive en la raiz del monorepo. Se busca por candidatos y no con
// __dirname porque este archivo se ejecuta tanto compilado a CommonJS (nest)
// como transformado a ESM (vitest), y en ESM __dirname no existe.
for (const candidato of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidato)) {
    config({ path: candidato });
    break;
  }
}

/**
 * Variables de entorno, validadas al arrancar.
 *
 * Si falta una o esta mal, el proceso muere aqui con un mensaje claro, no tres
 * capas mas abajo con un `undefined` en mitad de una consulta.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_URL: z.string().url().default('http://localhost:3001'),

  /**
   * Conexion de la APLICACION: rol `gymlab_app`, sin privilegios, sujeto a RLS.
   *
   * NO es DATABASE_URL. Esa pertenece al rol propietario y solo la usan las
   * migraciones. Si la API se conectara con ella, RLS quedaria sin efecto y el
   * aislamiento entre gimnasios seria inexistente (ver ADR-002).
   *
   * `assertRlsIsEnforced()` lo comprueba al arrancar, por si alguien las cambia.
   */
  DATABASE_URL_APP: z.string().min(1),

  /** Secreto de firma de Better Auth. En produccion, un secreto real y rotado. */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET debe tener al menos 32 caracteres'),

  /**
   * Codigo que exige /v1/auth/register-gym mientras estemos en piloto.
   * Se sustituira por el flujo de pago cuando entre Stripe (ADR-0007, decision 6).
   */
  PLATFORM_INVITE_CODE: z.string().min(8),

  /**
   * Origenes permitidos por CORS, separados por comas.
   *
   * Lista blanca y nunca `*`: el transporte por cookie exige
   * `credentials: true`, y el navegador rechaza esa combinacion con comodin.
   */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`[api] Configuracion de entorno invalida:\n${detalle}`);
}

export const env = parsed.data;
export type Env = typeof env;
