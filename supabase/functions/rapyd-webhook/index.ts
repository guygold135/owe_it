import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, rapyd-signature",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase not configured" }, 500);
    }

    const raw = await req.text();
    const headers = Object.fromEntries(req.headers.entries());

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await supabase.from("rapyd_webhook_events").insert({
      received_at: new Date().toISOString(),
      headers,
      payload: raw,
    });

    // Parse common webhook fields (Rapyd sends: { id, type, data, ... }).
    // We update goals only when metadata.goal_id is present (from our checkout creation).
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    const type = typeof parsed?.type === "string" ? parsed.type : null;
    const data = parsed?.data ?? null;
    const paymentId = typeof data?.id === "string" ? data.id : null;
    const goalId = typeof data?.metadata?.goal_id === "string" ? data.metadata.goal_id : null;

    if (goalId) {
      const nextStatus =
        type === "PAYMENT_SUCCEEDED" ? "captured" :
        type === "PAYMENT_FAILED" ? "payment_failed" :
        type === "PAYMENT_CANCELED" ? "cancelled" :
        type === "PAYMENT_EXPIRED" ? "expired" :
        null;

      if (nextStatus) {
        await supabase
          .from("goals")
          .update({
            payment_provider: "rapyd",
            rapyd_payment_id: paymentId,
            payment_status: nextStatus,
            last_payment_error: nextStatus === "payment_failed"
              ? (typeof data?.failure_message === "string" ? data.failure_message : "Rapyd payment failed")
              : null,
          })
          .eq("id", goalId);
      }
    }

    return jsonResponse({ received: true }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("rapyd-webhook error:", message);
    // Always 200 to prevent webhook retry storms while iterating.
    return jsonResponse({ received: false, error: message }, 200);
  }
});

