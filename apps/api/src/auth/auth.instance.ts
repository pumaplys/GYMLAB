import {
  accounts,
  EMAIL_QUEUES,
  eq,
  sessions,
  users,
  verifications,
  withoutTenant,
  type Database,
} from '@gymlab/db';
import { env } from '../config/env';
import type { JobsService } from '../jobs/jobs.service';

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

export async function createAuth(db: Database, jobs: JobsService) {
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

      // No se envia nada aqui: se encola. Si hay transaccion de peticion, el
      // trabajo entra en ella y solo existira si los datos commitean
      // (transactional outbox, ADR-0008).
      sendResetPassword: async ({ user, token }) => {
        // Se IGNORA la `url` que construye Better Auth, y no es un descuido.
        //
        // Better Auth genera `{baseURL}/reset-password/{token}`, que es una ruta
        // de SU router HTTP — y ADR-0009 decidio no montarlo. Ese enlace estaria
        // muerto. Solo se noto al empezar a enviar correos de verdad.
        //
        // El enlace se arma aqui, apuntando al panel web, que es donde hay un
        // formulario para escribir la contrasena nueva.
        await jobs.enqueue(EMAIL_QUEUES.resetPassword, {
          to: user.email,
          token,
          url: `${env.WEB_APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
        });
      },

      /**
       * Cambiar la contrasena cierra TODAS las sesiones abiertas.
       *
       * Sin esto, restablecerla no echa a quien te haya robado la sesion — y
       * ese es justo el gesto que hace alguien cuando sospecha que le han
       * entrado. Un reset que no expulsa al intruso da una falsa sensacion de
       * haber recuperado el control.
       *
       * Se borran todas, incluida la de quien lo pide: tendra que entrar con la
       * contrasena nueva, que es lo esperable.
       */
      onPasswordReset: async ({ user }) => {
        await withoutTenant(db, (tx) => tx.delete(sessions).where(eq(sessions.userId, user.id)));
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, token }) => {
        // Mismo motivo que arriba: su `url` apunta a un router que no montamos.
        await jobs.enqueue(EMAIL_QUEUES.verifyEmail, {
          to: user.email,
          token,
          url: `${env.WEB_APP_URL}/verify-email?token=${encodeURIComponent(token)}`,
        });
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
      // Techo global. La duracion real de cada sesion la fija AuthService segun
      // el rol (ADR-0007, decision 8): 12 h para el personal, 90 dias para el
      // socio. Este valor es el mayor de los dos porque solo puede acortarse
      // despues, nunca alargarse.
      expiresIn: 90 * 24 * 60 * 60,

      // Imprescindible para que lo anterior se sostenga: con el refresco
      // deslizante activo, Better Auth devolveria la caducidad de una sesion de
      // recepcion a los 90 dias en la primera peticion, anulando el limite de
      // 12 h. A cambio, nadie renueva por uso: la caducidad es absoluta desde
      // el login, que ademas es mas predecible.
      disableSessionRefresh: true,

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
