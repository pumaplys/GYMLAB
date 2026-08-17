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
   * Version vigente del consentimiento de datos de salud (RGPD art. 9).
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ OPCIONAL, Y MIENTRAS NO EXISTA NO SE PUEDE REGISTRAR NINGUN PESO.         │
   * │                                                                          │
   * │ No es un descuido ni un interruptor de funcionalidad: es que todavia no   │
   * │ hay texto legal, y se decidio dejar el dato PENDIENTE antes que inventar  │
   * │ una version ficticia. Con una inventada, el sistema aceptaria datos de    │
   * │ salud amparandose en un consentimiento que nadie redacto ni acepto.       │
   * │                                                                          │
   * │ Cuando exista, se pone aqui su identificador —por ejemplo '2026-09-01'—.  │
   * │ Cambiarla EXIGE una aceptacion nueva a todo el mundo: la validez se       │
   * │ comprueba contra este valor exacto, asi que un consentimiento de la       │
   * │ version anterior deja de servir el dia que esto cambia.                    │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  HEALTH_CONSENT_VERSION: z.string().min(1).optional(),

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
   * Cuantos proxies de confianza hay DELANTE de este proceso.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ NO ES AFINAR UN REGISTRO: DE ESTO DEPENDE EL LIMITE DE INTENTOS.         │
   * │                                                                          │
   * │ `x-forwarded-for` la escribe QUIEN LLAMA, asi que sin nadie delante que  │
   * │ la reescriba, el cliente elige la IP con la que se le cuenta.            │
   * │                                                                          │
   * │ Medido contra este mismo proceso: con la cabecera fija, el sexto intento │
   * │ fallido devuelve 429; rotandola, 12 de 12 pasaron. El limite por IP se   │
   * │ esquivaba con una cabecera.                                              │
   * │                                                                          │
   * │ Con este numero, Express descarta tantos saltos por la derecha y deja en │
   * │ `request.ip` la unica direccion que escribio alguien de confianza. Es la │
   * │ que se usa (ver `toHeaders`).                                             │
   * │                                                                          │
   * │ 0 = no hay proxy y vale la del socket. Detras de Caddy: 1.               │
   * │                                                                          │
   * │ QUE PASA SI SE PONE MAL, medido en contenedor con Caddy delante:         │
   * │                                                                          │
   * │ - a 0 detras del proxy NO se cuela nadie, pero `request.ip` pasa a ser   │
   * │   la de Caddy PARA TODO EL MUNDO: el gimnasio entero comparte cubo de    │
   * │   intentos y la IP que se guarda en auditoria no identifica a nadie.     │
   * │                                                                          │
   * │ - a 5 —cuatro saltos de mas— tampoco se colo nadie, y merece explicacion │
   * │   porque contradice lo que decia antes este comentario: Caddy no ANADE a │
   * │   la cadena, la REEMPLAZA por la IP que el observo, asi que nunca hay    │
   * │   mas de una entrada que descartar. Detras de un proxy que la fuera      │
   * │   anadiendo —nginx con `proxy_add_x_forwarded_for`— sobrepasarse SI      │
   * │   volveria creible lo que mande el cliente. Sigue siendo mala idea       │
   * │   declarar saltos que no existen; solo no es explotable con Caddy.       │
   * │                                                                          │
   * │ Lo que SI abre el agujero es que se pueda llegar al puerto sin pasar por │
   * │ el proxy: atacando 3001 directamente, con este valor a 1, ocho de ocho   │
   * │ intentos esquivaron el limite rotando la cabecera. Por eso el contenedor │
   * │ publica el puerto SOLO en el bucle local — ver compose de produccion.    │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

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
   * El valor por defecto solo sirve para el transporte de consola. En cuanto
   * hay `RESEND_API_KEY`, esta variable pasa a ser obligatoria y con dominio
   * real — lo comprueba el `superRefine` de abajo.
   */
  EMAIL_FROM: z.string().min(1).default('GYMLAB <no-reply@localhost>'),
});

/**
 * El esquema con las comprobaciones que cruzan variables.
 *
 * Va aparte del objeto porque `superRefine` devuelve otro tipo que ya no
 * expone `.shape`, y de ahi salen `ENV_KEYS` — la lista que vigila el cableado
 * con `turbo.json`.
 */
const schemaValidado = schema
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ EN PRODUCCION, LOS VALORES POR DEFECTO SON UN DESPLIEGUE INSEGURO.     │
   * │                                                                        │
   * │ Casi todo aqui tiene un default comodo para desarrollo, y ese default  │
   * │ apunta a `localhost` por HTTP. El problema no es que sea incomodo: es  │
   * │ que NO SE NOTA. El proceso arranca, `/health` responde 200 y todo      │
   * │ parece bien.                                                           │
   * │                                                                        │
   * │ El caso concreto que motiva esto: `API_URL` es de donde Better Auth    │
   * │ deduce si la cookie de sesion lleva `Secure`. El compose lo pasa como  │
   * │ `${DOMINIO}`, y si esa variable no esta en el `.env`, Compose la       │
   * │ sustituye por CADENA VACIA — que `sinVacias` trata como ausente, asi   │
   * │ que entra el default `http://localhost:3001` y la sesion viaja SIN     │
   * │ `Secure`. Un olvido de una linea en un fichero degrada la sesion de    │
   * │ todo el mundo, en silencio.                                            │
   * │                                                                        │
   * │ Mismo razonamiento para `WEB_APP_URL` —los enlaces de invitacion y de  │
   * │ restablecer contrasena llevarian a localhost— y para `CORS_ORIGINS`,   │
   * │ cuyo default deja `http://localhost:3000` como origen de confianza con │
   * │ `credentials: true` en un despliegue publico.                          │
   * │                                                                        │
   * │ En produccion se prefiere no arrancar a arrancar mintiendo, igual que  │
   * │ con el remitente de Resend.                                            │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  .superRefine((valores, ctx) => {
    if (valores.NODE_ENV !== 'production') return;

    for (const clave of ['API_URL', 'WEB_APP_URL'] as const) {
      const valor = valores[clave];
      if (!valor.startsWith('https://') || esLocal(valor)) {
        ctx.addIssue({
          code: 'custom',
          path: [clave],
          message:
            `En produccion ${clave} debe ser la URL publica por HTTPS, y vale "${valor}". ` +
            'De aqui sale si la cookie de sesion lleva Secure y adonde apuntan los enlaces ' +
            'de los correos. Comprueba que DOMINIO este definido en el .env del despliegue: ' +
            'si falta, Compose lo sustituye por cadena vacia y entra el valor de desarrollo.',
        });
      }
    }

    const locales = valores.CORS_ORIGINS.filter((o) => esLocal(o) || o.startsWith('http://'));
    if (locales.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message:
          `En produccion CORS_ORIGINS no puede incluir origenes locales ni HTTP, y trae ${locales.join(', ')}. ` +
          'Con credentials: true eso es un origen de confianza que puede hacer peticiones ' +
          'autenticadas contra este despliegue. El panel se sirve desde el mismo origen que ' +
          'la API, asi que lo normal es que aqui solo este el dominio publico.',
      });
    }
  })
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CON CLAVE DE RESEND, EL REMITENTE TIENE QUE SER DE VERDAD.             │
   * │                                                                        │
   * │ Sin esta comprobacion el proceso arrancaba PERFECTAMENTE con la clave  │
   * │ puesta y el remitente por defecto, `no-reply@localhost`. Resend         │
   * │ respondia `invalid_from_address`, que esta clasificado como error      │
   * │ DEFINITIVO, asi que el trabajo se descartaba SIN REINTENTO y nadie     │
   * │ recibia nada. Ni invitaciones ni recuperaciones de contrasena.         │
   * │                                                                        │
   * │ El unico rastro era una linea de ERROR en el log. Es el peor modo de   │
   * │ fallo posible: todo parece en pie y el producto no funciona.           │
   * │                                                                        │
   * │ Mismo criterio que `MailModule` con la clave ausente: en produccion se │
   * │ prefiere no arrancar a arrancar mintiendo.                             │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  .superRefine((valores, ctx) => {
    if (!valores.RESEND_API_KEY) return;

    const direccion = direccionDe(valores.EMAIL_FROM);
    if (!direccion) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message:
          'Con RESEND_API_KEY, EMAIL_FROM debe llevar una direccion valida, ' +
          'con la forma "GYMLAB <no-reply@tudominio.com>" o "no-reply@tudominio.com".',
      });
      return;
    }

    const dominio = direccion.split('@')[1]!;
    // Un dominio sin punto —`localhost`, `localdomain`— no puede estar
    // verificado en Resend ni existir en el DNS publico.
    if (!dominio.includes('.')) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message:
          `El remitente apunta a "${dominio}", que no es un dominio real. ` +
          'Con RESEND_API_KEY hace falta un dominio verificado en Resend: ' +
          'enviar desde uno sin verificar acaba en spam, que es peor que no enviar.',
      });
    }
  });

/**
 * La direccion de un remitente, admitiendo las dos formas que acepta Resend:
 * `Nombre <a@b.c>` y `a@b.c`. Devuelve null si no hay ninguna.
 */
/**
 * Si una URL u origen apunta a la propia maquina.
 *
 * Se mira el HOST, no la cadena entera: `https://localhost.miempresa.com` es un
 * dominio publico perfectamente valido y no debe confundirse con `localhost`.
 */
function esLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

function direccionDe(remitente: string): string | null {
  const entreAngulos = /<([^>]+)>/.exec(remitente);
  const candidato = (entreAngulos ? entreAngulos[1]! : remitente).trim();
  return /^[^\s@]+@[^\s@]+$/.test(candidato) ? candidato : null;
}

/**
 * Una variable VACIA es una variable AUSENTE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN ESTO, `RESEND_API_KEY=` IMPIDE ARRANCAR.                             │
 * │                                                                          │
 * │ Las opcionales se declaran `.min(1).optional()`: `optional` cubre que no │
 * │ este, pero una cadena vacia SI esta y no llega a un caracter. El proceso │
 * │ moria diciendo "expected string to have >=1 characters" sobre una        │
 * │ variable que su propia documentacion describe como opcional.             │
 * │                                                                          │
 * │ Y no es rebuscado: es lo que produce cualquier plantilla de despliegue.  │
 * │ `docker compose` sustituye `${VARIABLE:-}` por vacio, y una linea suelta │
 * │ `RESEND_API_KEY=` en un `.env` hace lo mismo. Se descubrio levantando el │
 * │ compose de produccion con `HEALTH_CONSENT_VERSION` sin valor.            │
 * │                                                                          │
 * │ En el shell no hay diferencia entre "vacia" y "sin poner". Aqui tampoco. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function sinVacias(valores: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(valores).filter(([, valor]) => valor !== ''),
  ) as Record<string, string>;
}

/**
 * Valida un conjunto de variables y devuelve los problemas, uno por linea.
 *
 * Se exporta para poder comprobar la configuracion SIN arrancar el proceso:
 * las reglas que cruzan variables —el remitente cuando hay clave de Resend—
 * solo se pueden probar asi, porque el modulo valida al importarse.
 */
export function problemasDeEntorno(valores: NodeJS.ProcessEnv): string[] {
  const resultado = schemaValidado.safeParse(sinVacias(valores));
  if (resultado.success) return [];
  return resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

const parsed = schemaValidado.safeParse(sinVacias(process.env));

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`[api] Configuracion de entorno invalida:\n${detalle}`);
}

export const env = parsed.data;
export type Env = typeof env;

/**
 * Las claves declaradas aqui, para que un test compruebe el cableado.
 *
 * Anadir una variable exige tocar TRES sitios: este esquema, `turbo.json` —que
 * corre en modo estricto y no deja pasar lo que no declara— y el workflow de CI
 * si es obligatoria. En local nada de eso hace falta, porque `.env` la aporta, y
 * por eso el olvido no se nota hasta que CI se pone en rojo. Ya ha pasado dos
 * veces: con las variables de Resend y con la semilla del QR.
 */
export const ENV_KEYS = Object.keys(schema.shape) as (keyof typeof schema.shape)[];

/** Las que NO tienen valor por defecto: sin ellas el proceso no arranca. */
export const ENV_KEYS_OBLIGATORIAS = ENV_KEYS.filter(
  (k) => !schema.shape[k].safeParse(undefined).success,
);
