import Stripe from "npm:stripe@16.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    if (!stripeSecret || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Server configuration missing" }, 500);
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) return jsonResponse({ error: "Missing stripe-signature header" }, 400);

    const payload = await req.text();
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      stripeWebhookSecret,
    );

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const accountId = account.id;
      const appUserId = account.metadata?.app_user_id;
      const ready = !!(account.details_submitted && account.payouts_enabled);

      if (typeof appUserId === "string" && appUserId.length > 0) {
        await supabase
          .from("profiles")
          .update({
            stripe_connect_account_id: accountId,
            stake_payouts_ready: ready,
          })
          .eq("id", appUserId);
      } else {
        await supabase
          .from("profiles")
          .update({ stake_payouts_ready: ready })
          .eq("stripe_connect_account_id", accountId);
      }

      await supabase
        .from("charities")
        .update({ stake_payouts_ready: ready })
        .eq("stripe_connect_account_id", accountId);
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const goalId = pi.metadata?.goal_id;
      if (goalId) {
        await supabase
          .from("goals")
          .update({
            payment_intent_id: pi.id,
            payment_status: "captured",
            payment_retry_count: 0,
            next_payment_retry_at: null,
            last_payment_error: null,
          })
          .eq("id", goalId);
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const goalId = pi.metadata?.goal_id;
      const message =
        pi.last_payment_error?.message ?? "Stripe reported payment_intent.payment_failed";
      if (goalId) {
        const { data: goal } = await supabase
          .from("goals")
          .select("payment_retry_count")
          .eq("id", goalId)
          .single();
        const retries = Number(goal?.payment_retry_count ?? 0) + 1;
        const nextRetryAt = new Date(Date.now() + Math.min(24, 2 ** retries) * 60 * 60 * 1000)
          .toISOString();
        await supabase
          .from("goals")
          .update({
            payment_status: "payment_failed",
            payment_retry_count: retries,
            next_payment_retry_at: nextRetryAt,
            last_payment_error: message,
          })
          .eq("id", goalId);
      }
    }

    return jsonResponse({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("stripe-webhook error:", message);
    return jsonResponse({ error: message }, 400);
  }
});
