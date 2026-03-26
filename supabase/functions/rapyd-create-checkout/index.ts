import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { rapydFetch } from "../_shared/rapyd.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

type Body = {
  userId: string;
  amount: number; // in currency units (e.g. 10.00)
  currency: string; // ILS, USD...
  country: string; // IL, US...
  completePaymentUrl: string;
  cancelPaymentUrl: string;
  goalId?: string | null;
  metadata?: Record<string, unknown>;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase not configured" }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const userId = body.userId;
    const currency = String(body.currency ?? "").toUpperCase();
    const country = String(body.country ?? "").toUpperCase();
    const amount = Number(body.amount);
    const completePaymentUrl = String(body.completePaymentUrl ?? "");
    const cancelPaymentUrl = String(body.cancelPaymentUrl ?? "");

    if (!userId || !Number.isFinite(amount) || amount <= 0 || !currency || !country) {
      return jsonResponse({ error: "Missing/invalid fields" }, 400);
    }
    if (!completePaymentUrl.startsWith("http") || !cancelPaymentUrl.startsWith("http")) {
      return jsonResponse({ error: "Missing/invalid return URLs" }, 400);
    }

    const payload = {
      amount,
      currency,
      country,
      complete_payment_url: completePaymentUrl,
      cancel_payment_url: cancelPaymentUrl,
      metadata: {
        user_id: userId,
        goal_id: body.goalId ?? undefined,
        ...(body.metadata ?? {}),
      },
    };

    const bodyString = JSON.stringify(payload);
    const { res, json, text } = await rapydFetch("/v1/checkout", {
      method: "POST",
      body: bodyString,
      bodyString,
      headers: { idempotency: `checkout_${userId}_${Date.now()}` },
    });

    if (!res.ok) {
      return jsonResponse({ error: "Rapyd error", rapyd: json ?? text }, 400);
    }

    const checkout = (json as any)?.data;
    const checkoutId = checkout?.id as string | undefined;
    const redirectUrl = checkout?.redirect_url as string | undefined;

    if (!checkoutId || !redirectUrl) {
      return jsonResponse({ error: "Missing Rapyd checkout response", rapyd: json }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    if (body.goalId) {
      await supabase
        .from("goals")
        .update({
          payment_provider: "rapyd",
          rapyd_checkout_id: checkoutId,
          payment_status: "created_checkout",
        })
        .eq("id", body.goalId);
    }

    return jsonResponse({ success: true, checkoutId, redirectUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("rapyd-create-checkout error:", message);
    return jsonResponse({ error: message }, 500);
  }
});

