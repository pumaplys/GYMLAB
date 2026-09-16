import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Las variables del `.env` DE LA RAIZ del monorepo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NEXT SOLO MIRA `apps/web/.env*`, Y AQUI EL `.env` VIVE EN LA RAIZ.       │
 * │                                                                          │
 * │ La API ya lo resuelve con dotenv por el mismo motivo. Sin esto, la       │
 * │ identidad del prestador estaba puesta en el `.env` y el panel seguia     │
 * │ pintando «Sin configurar»: el gate decia que si y la pagina decia que    │
 * │ no. Dos fuentes que se contradicen son peor que una sola incompleta.     │
 * │                                                                          │
 * │ Se lee a mano, sin dependencias, porque es un `CLAVE=valor` y anadir     │
 * │ dotenv al panel solo para esto seria pagar de mas.                        │
 * │                                                                          │
 * │ EL ENTORNO REAL SIEMPRE GANA: lo del fichero solo rellena lo que no      │
 * │ venga ya puesto, que es lo que permite que el Dockerfile las inyecte     │
 * │ como argumentos de construccion sin que un `.env` olvidado las pise.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function delEnvDeLaRaiz(claves) {
  const fichero = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
  const valores = {};
  for (const clave of claves) valores[clave] = process.env[clave] ?? '';
  if (!existsSync(fichero)) return valores;

  for (const linea of readFileSync(fichero, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    if (claves.includes(clave) && !valores[clave]) valores[clave] = limpia.slice(corte + 1).trim();
  }
  return valores;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * La identidad legal del prestador, incrustada al construir.
   *
   * No esta en el codigo a proposito —son datos personales de quien presta el
   * servicio— y por eso entra por aqui. Si falta, `lib/prestador.ts` lo detecta
   * y las paginas legales dicen que falta en vez de inventarla.
   */
  env: delEnvDeLaRaiz([
    'NEXT_PUBLIC_PRESTADOR_NOMBRE',
    'NEXT_PUBLIC_PRESTADOR_DOMICILIO',
    'NEXT_PUBLIC_PRESTADOR_NIF',
  ]),

  /**
   * EXPORTACION ESTATICA. Es lo que permite quedarse con Next.js.
   *
   * El unico argumento solido en su contra era el runtime de Node que habria que
   * operar en produccion: otro proceso, otro despliegue, otra cosa que se cae de
   * madrugada. Con esto, `next build` produce ficheros estaticos en `out/` y
   * Next.js queda como herramienta de construccion, no como servidor.
   *
   * CONSECUENCIA QUE HAY QUE RESPETAR AL ESCRIBIR PANTALLAS: no hay funciones de
   * servidor. Nada de `getServerSideProps`, rutas de API, Server Actions ni
   * middleware. Los datos vienen de la API propia, que es lo que ya se decidio.
   *
   * Si alguna pantalla llegara a necesitar renderizado en servidor de verdad,
   * esto deja de valer y vuelve a haber un proceso que operar. Seria el momento
   * de reabrir la decision, no de borrar esta linea sin mas.
   */
  output: 'export',

  /**
   * La optimizacion de imagenes necesita un servidor, asi que en exportacion
   * estatica hay que desactivarla o el build falla.
   *
   * No se pierde nada —un panel de gestion no tiene imagenes que optimizar— y de
   * paso `sharp` deja de hacer falta.
   */
  images: { unoptimized: true },

  // Los paquetes internos se compilan como parte de la app, no como dependencia
  // externa ya construida. Evita problemas de ESM/CJS dentro del monorepo.
  transpilePackages: ['@gymlab/contracts', '@gymlab/api-client'],
};

export default nextConfig;
