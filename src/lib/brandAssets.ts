/**
 * Logo URLs must change on every production deploy, or CDNs and browsers keep serving
 * stale /app-logo.svg and favicons (query strings like ?v=8 are often ignored for favicons).
 */
const cacheKey =
  import.meta.env.VITE_GIT_SHA ||
  import.meta.env.VITE_APP_VERSION ||
  "dev";

export const APP_LOGO_SRC = `/app-logo.svg?v=${cacheKey}`;
