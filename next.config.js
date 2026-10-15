/** @type {import('next').NextConfig} */
// Ruta canonica: https://miguelcalzada.com/impactdb (rewrite del portfolio).
const BASE_PATH = '/impactdb';
const NO_SNIFF = { key: 'X-Content-Type-Options', value: 'nosniff' };
// Las paginas HTML no se cachean: miguelcalzada.com las sirve por rewrite y una
// copia antigua en el borde dejaria el monograma/estilos desincronizados.
const NO_STORE = { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=0, must-revalidate' };

const nextConfig = {
  basePath: BASE_PATH,
  experimental: {
    serverComponentsExternalPackages: ['pg'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // La URL del servicio en Railway redirige al dominio canonico.
  // basePath: false evita que el prefijo interfiera con el proxy del portal.
  async redirects() {
    return [
      {
        source: '/',
        destination: 'https://miguelcalzada.com/impactdb',
        permanent: true,
        basePath: false,
      },
    ];
  },
  async headers() {
    return [
      { source: '/', headers: [NO_SNIFF, NO_STORE] },
      { source: '/(.*)', headers: [NO_SNIFF] },
    ];
  },
};

module.exports = nextConfig;
