import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { rapydFetch } from "../_shared/rapyd.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // Lightweight call just to confirm auth/signature works.
    const { res, json, text } = await rapydFetch("/v1/data/countries", { method: "GET" });
    if (!res.ok) {
      return jsonResponse(
        {
          ok: false,
          status: res.status,
          rapyd: json ?? text,
        },
        200,
      );
    }
    const countries = (json as any)?.data ?? null;
    return jsonResponse(
      {
        ok: true,
        status: res.status,
        sample: Array.isArray(countries) ? countries.slice(0, 5) : countries,
      },
      200,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 200);
  }
});

