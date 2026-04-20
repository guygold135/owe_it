const DEFAULT_ALLOWED_ORIGINS = [
  "https://oweit.site",
  "https://www.oweit.site",
  "http://localhost:8080",
  "http://localhost:5173",
];

function parseAllowedOrigins(): string[] {
  const configured = Deno.env.get("CORS_ALLOWED_ORIGINS");
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;

  const parsed = configured
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

export function buildCorsHeaders(
  req: Request,
  allowedHeaders = "authorization, x-client-info, apikey, content-type",
): Record<string, string> | null {
  const allowedOrigins = parseAllowedOrigins();
  const requestOrigin = req.headers.get("origin");

  if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": requestOrigin ?? allowedOrigins[0],
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
