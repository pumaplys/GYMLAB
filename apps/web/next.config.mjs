/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

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
