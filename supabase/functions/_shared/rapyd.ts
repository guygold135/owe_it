function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export type RapydEnv = {
  accessKey: string;
  secretKey: string;
  baseUrl: string;
};

function getRequiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function getRapydEnv(): RapydEnv {
  const accessKey = getRequiredEnv("RAPYD_ACCESS_KEY");
  const secretKey = getRequiredEnv("RAPYD_SECRET_KEY");
  const baseUrl = getRequiredEnv("RAPYD_BASE_URL").replace(/\/+$/, "");
  return { accessKey, secretKey, baseUrl };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSaltHex(byteLen = 8): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Rapyd signature: base64( hex( hmac_sha256(secretKey, toSign) ) )
 * toSign = methodLower + urlPath + salt + timestamp + accessKey + secretKey + bodyString
 * bodyString must be whitespace-free JSON string (or empty string, not "{}").
 */
export async function rapydSignature(params: {
  method: string;
  urlPathWithQuery: string; // starts with /v1...
  salt: string;
  timestamp: number; // unix seconds
  accessKey: string;
  secretKey: string;
  bodyString: string;
}): Promise<string> {
  const methodLower = params.method.toLowerCase();
  const body = params.bodyString === "{}" ? "" : params.bodyString;
  const toSign =
    methodLower +
    params.urlPathWithQuery +
    params.salt +
    String(params.timestamp) +
    params.accessKey +
    params.secretKey +
    body;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(params.secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const sigHex = bytesToHex(new Uint8Array(sigBuf));
  // Base64 of the HEX STRING bytes (as shown in Rapyd examples).
  return encodeBase64Bytes(new TextEncoder().encode(sigHex));
}

function buildUrlPathWithQuery(url: URL): string {
  const path = url.pathname + (url.search || "");
  if (!path.startsWith("/v1")) {
    throw new Error(`Rapyd urlPath must start with /v1 (got: ${path})`);
  }
  return path;
}

export async function rapydFetch(path: string, init?: RequestInit & { bodyString?: string }) {
  const { accessKey, secretKey, baseUrl } = getRapydEnv();
  const url = new URL(path, baseUrl);
  const urlPathWithQuery = buildUrlPathWithQuery(url);

  const method = (init?.method ?? "GET").toUpperCase();
  const timestamp = Math.floor(Date.now() / 1000);
  const salt = randomSaltHex(8);
  const bodyString = init?.bodyString ?? (typeof init?.body === "string" ? init.body : "");

  const signature = await rapydSignature({
    method,
    urlPathWithQuery,
    salt,
    timestamp,
    accessKey,
    secretKey,
    bodyString,
  });

  const headers = new Headers(init?.headers ?? {});
  headers.set("access_key", accessKey);
  headers.set("salt", salt);
  headers.set("timestamp", String(timestamp));
  headers.set("signature", signature);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");

  const res = await fetch(url.toString(), {
    ...init,
    method,
    headers,
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  return { res, text, json };
}

