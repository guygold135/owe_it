import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isBraintreeConfigured, upsertVaultedPaymentMethod } from "../_shared/braintree.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function getAuthenticatedUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !supabaseUrl || !supabaseAnonKey) return null;
  const token = authHeader.slice(7);
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.id) return null;
  return { id: user.id, email: user.email ?? undefined };
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(req);
  if (!corsHeaders) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, corsHeaders, 405);

  try {
    if (!isBraintreeConfigured()) {
      return jsonResponse({ error: "Braintree is not configured" }, corsHeaders, 500);
    }
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);

    const body = await req.json().catch(() => ({}));
    const { paymentMethodNonce } = body as { paymentMethodNonce?: string };
    if (!paymentMethodNonce || typeof paymentMethodNonce !== "string") {
      return jsonResponse({ error: "Missing paymentMethodNonce" }, corsHeaders, 400);
    }

    const vaulted = await upsertVaultedPaymentMethod({
      appUserId: authUser.id,
      email: authUser.email,
      paymentMethodNonce,
    });

    return jsonResponse(
      {
        success: true,
        braintreeCustomerId: vaulted.customerId,
        paymentMethodToken: vaulted.paymentMethodToken,
      },
      corsHeaders,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("vault-braintree-payment-method error:", message);
    return jsonResponse({ error: message }, corsHeaders, 500);
  }
});
