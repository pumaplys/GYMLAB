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
   * Semilla de la que se derivan las claves de firma del QR de acceso.
   *
   * NO se usa directamente para firmar: de ella sale una clave por gimnasio con
   * HKDF, de modo que un token del gimnasio A no verifica en el B. Ver
   * `access/access-token.ts`.
   *
   * Es distinta de `AUTH_SECRET` a proposito. Comprometer una no debe comprometer
   * la otra, y son cosas de vida muy distinta: las sesiones duran meses y estos
   * tokens sesenta segundos, asi que rotar esta apenas cuesta nada.
   */
  ACCESS_TOKEN_SECRET: z
    .string()
    .min(32, 'ACCESS_TOKEN_SECRET debe tener al menos 32 caracteres'),

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

  /**
   * URL del panel web. Es la BASE DE LOS ENLACES DE LOS CORREOS.
   *
   * Antes se usaba `API_URL`, que apuntaba a la API: los enlaces de invitacion y
   * de restablecer contrasena llevaban a un sitio sin interfaz. Nadie lo noto
   * porque los correos nunca se enviaban.
   */
  WEB_APP_URL: z.string().url().default('http://localhost:3000'),

  /**
   * Clave de Resend. OPCIONAL a proposito.
   *
   * Sin ella, el envio usa el transporte de consola: en desarrollo se registra
   * el contenido y se puede recorrer el flujo sin cuenta de Resend. En
   * produccion, arrancar sin clave es un error de configuracion y el proceso lo
   * dice al arrancar (ver MailModule).
   */
  RESEND_API_KEY: z.string().min(1).optional(),

  /**
   * Remitente. Debe ser un dominio verificado en Resend.
   *
   * Obligatorio junto con la clave: enviar desde un dominio sin verificar acaba
   * en la carpeta de spam, que es peor que no enviar — nadie se enteraria.
   */
  EMAIL_FROM: z.string().min(1).default('GYMLAB <no-reply@localhost>'),
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
