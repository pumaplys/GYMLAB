import { accounts, sessions, users, verifications, type Database } from '@gymlab/db';
import { recordPendingEmail } from '../common/pending-email';
import { env } from '../config/env';

/**
 * Instancia de Better Auth.
 *
 * IMPORTANTE (ADR-0009): su router HTTP **no se monta**. Solo se consume su API
 * de servidor (`auth.api.*`) desde nuestros controladores. Ninguna ruta suya es
 * accesible desde fuera, ni hoy ni cuando una actualizacion anada endpoints
 * nuevos.
 *
 * Por eso `disableSignUp` queda en `false`: la comprobacion de esa opcion vive
 * dentro del handler de la ruta, que es el mismo codigo que ejecuta
 * `auth.api.signUpEmail()`. Ponerla a `true` impediria crear usuarios tambien
 * desde nuestros propios endpoints de confianza, y romperia las invitaciones.
 * Quien impide el auto-registro publico es que no exponemos esa ruta.
 */
export type Auth = Awaited<ReturnType<typeof createAuth>>;

export async function createAuth(db: Database) {
  // better-auth se publica solo como ESM, y esta API compila a CommonJS.
  //
  // Se podria convertir apps/api entera a ESM, pero NestJS con ESM y
  // decoradores tiene bastantes aristas, y ADR-004 eligio NestJS justamente
  // por su rigidez. Sale mas barato aislar la incompatibilidad en este archivo
  // con una importacion dinamica, que en CommonJS si esta permitida.
  const { betterAuth } = await import('better-auth');
  const { drizzleAdapter } = await import('better-auth/adapters/drizzle');
  const { bearer } = await import('better-auth/plugins/bearer');

  return betterAuth({
    // Better Auth solo acepta cookies por defecto. El plugin `bearer` habilita
    // `Authorization: Bearer <token>`, que es el transporte de la app movil:
    // React Native no tiene cookies (ADR-0007).
    //
    // El panel web seguira usando cookie httpOnly, que es inmune al robo por
    // XSS. Dos transportes, una sola sesion detras.
    plugins: [bearer()],

    appName: 'GYMLAB',
    secret: env.AUTH_SECRET,
    baseURL: env.API_URL,

    database: drizzleAdapter(db, {
      provider: 'pg',
      // Nuestras tablas se llaman users/sessions/accounts/verifications; sus
      // modelos, user/session/account/verification.
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),

    advanced: {
      database: {
        // Nuestras columnas `id` son uuid. Sin esto, Better Auth generaria
        // cadenas aleatorias de 32 caracteres y el INSERT fallaria.
        generateId: 'uuid',
      },
    },

    emailAndPassword: {
      enabled: true,
      // Ver el comentario de cabecera: no es un descuido.
      disableSignUp: false,
      minPasswordLength: 10,
      // Se activara cuando exista el envio de emails por pg-boss (ADR-0008).
      requireEmailVerification: false,

      // AQUI SE ENGANCHARA PG-BOSS. Hoy solo se anota el token; manana esta
      // linea sera `enqueue('email.reset-password', {...}, tx)` dentro de la
      // transaccion de la peticion, y el correo solo existira si los datos
      // llegaron a commitear (transactional outbox, ADR-0008).
      sendResetPassword: async ({ user, url, token }) => {
        recordPendingEmail({ kind: 'reset-password', token, url, userId: user.id });
      },
    },

    emailVerification: {
      // Mismo caso que arriba.
      sendVerificationEmail: async ({ user, url, token }) => {
        recordPendingEmail({ kind: 'verify-email', token, url, userId: user.id });
      },
    },

    user: {
      additionalFields: {
        isPlatformAdmin: {
          type: 'boolean',
          defaultValue: false,
          // `input: false` impide que llegue desde el cuerpo de una peticion.
          // Sin esto, cualquiera podria hacerse administrador de plataforma
          // metiendo el campo en el JSON de registro.
          input: false,
        },
      },
    },

    session: {
      additionalFields: {
        activeGymId: {
          type: 'string',
          required: false,
          // Igual que arriba, y aqui es aun mas critico: es el valor que
          // alimenta withTenant(). Nunca puede venir del cliente (ADR-0007).
          input: false,
        },
      },
    },
  });
}
