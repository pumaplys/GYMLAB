/**
 * Quien presta el servicio RINDA: identidad legal, leida de la CONFIGURACION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI UN DATO PERSONAL DEL PRESTADOR VIVE EN EL CODIGO, Y ES DELIBERADO.    │
 * │                                                                          │
 * │ Nombre, domicilio e identificador fiscal estan DESTINADOS a publicarse   │
 * │ —un aviso legal sin ellos no sirve— pero eso no obliga a meterlos en el  │
 * │ historial de git, que es para siempre y se clona entero. Aqui no hay     │
 * │ valores por defecto: si no estan en el entorno, no hay identidad, y las  │
 * │ paginas legales lo dicen en vez de inventarla.                           │
 * │                                                                          │
 * │ Son variables de RELEASE. `next build` las incrusta en la exportacion    │
 * │ estatica, asi que cambiarlas exige volver a construir — que es           │
 * │ exactamente la ceremonia que merece cambiar quien responde ante una      │
 * │ autoridad de control.                                                    │
 * │                                                                          │
 * │ EL NIF ES APARTE. Puede faltar mientras el resto esta: es el unico dato  │
 * │ que a fecha de hoy no se ha facilitado, y el gate de tiendas sabe        │
 * │ distinguir «falta el identificador fiscal» de «falta todo».              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se declaran en `.env` (que esta en `.gitignore`) y en `turbo.json`:
 *
 *   NEXT_PUBLIC_PRESTADOR_NOMBRE=...
 *   NEXT_PUBLIC_PRESTADOR_DOMICILIO=Calle...|Piso...|CP Ciudad|Pais
 *   NEXT_PUBLIC_PRESTADOR_NIF=...            (opcional, todavia)
 */

/** Las lineas del domicilio se separan por `|`: es una direccion, no un parrafo. */
const SEPARADOR = '|';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS TRES SE NOMBRAN ENTERAS, Y NO ES VERBOSIDAD.                        │
 * │                                                                          │
 * │ Next sustituye `process.env.NEXT_PUBLIC_X` por su valor AL CONSTRUIR,    │
 * │ buscando la expresion literal. Con acceso dinamico —`process.env[clave]`,│
 * │ que es como estaba— no hay nada que sustituir: en el servidor de         │
 * │ desarrollo la pagina salia «Sin configurar» aunque la variable           │
 * │ estuviera puesta, y en una exportacion estatica habria dependido de que  │
 * │ el proceso de build tuviera la variable de verdad.                       │
 * │                                                                          │
 * │ Se descubrio abriendo la pagina, no leyendo el codigo.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function limpiar(valor: string | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

/**
 * Las lineas del domicilio, TAL Y COMO SE ESCRIBIERON.
 *
 * No se normalizan acentos, ni se recolocan, ni se corrige la grafia. Un dato
 * legal se transcribe; quien lo «arregla» sin tener delante el documento
 * oficial es quien introduce el error.
 */
function domicilio(): string[] {
  const crudo = limpiar(process.env.NEXT_PUBLIC_PRESTADOR_DOMICILIO);
  if (!crudo) return [];
  return crudo
    .split(SEPARADOR)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export const PRESTADOR = {
  nombre: limpiar(process.env.NEXT_PUBLIC_PRESTADOR_NOMBRE),
  domicilio: domicilio(),
  /** Nulo mientras no se facilite. NO se inventa ni se sustituye por un ejemplo. */
  nif: limpiar(process.env.NEXT_PUBLIC_PRESTADOR_NIF),
} as const;

/** ¿Hay identidad suficiente para publicar un aviso legal, salvo el fiscal? */
export function hayIdentidad(): boolean {
  return PRESTADOR.nombre !== null && PRESTADOR.domicilio.length > 0;
}

/** ¿Está TODO, incluido el identificador fiscal? */
export function identidadCompleta(): boolean {
  return hayIdentidad() && PRESTADOR.nif !== null;
}
