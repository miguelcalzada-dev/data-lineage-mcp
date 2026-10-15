// Ruta bajo la que se sirve la app cuando se proxea desde miguelcalzada.com.
// Debe coincidir con `basePath` en next.config.js y con el rewrite del portfolio.
export const BASE_PATH = '/impactdb';

/**
 * Prefija una ruta de API con el basePath. Necesario porque `fetch` no lo
 * aplica automáticamente (a diferencia de `Link`/`router` de Next.js).
 */
export function apiPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
