/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Los paquetes internos se compilan como parte de la app, no como dependencia
  // externa ya construida. Evita problemas de ESM/CJS dentro del monorepo.
  transpilePackages: ['@gymlab/contracts'],
};

export default nextConfig;
