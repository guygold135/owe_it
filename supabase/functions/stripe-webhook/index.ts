import Stripe from "npm:stripe@16.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

async function recordEventStart(
  supabase: ReturnType<typeof createClient>,
  event: Stripe.Event,
): Promise<{ accepted: boolean }> {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode ?? false,
      api_version: event.api_version ?? null,
      status: "processing",
      received_at: new Date().toISOString(),
      payload: event as unknown as Record<string, unknown>,
    });

  if (!error) return { accepted: true };

  const duplicate = error.code === "23505" || error.message.toLowerCase().includes("duplicate");
  if (duplicate) return { accepted: false };

  throw new Error(`Could not persist webhook event start: ${error.message}`);
}

async function markEventProcessed(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
) {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("event_id", eventId);

  if (error) {
    throw new Error(`Could not mark webhook event as processed: ${error.message}`);
  }
}

async function markEventFailed(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  message: string,
) {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      status: "failed",
      processed_at: new Date().toISOString(),
      last_error: message,
    })
    .eq("event_id", eventId);

  if (error) {
    console.error("stripe-webhook: could not persist failed status:", error.message);
  }
}

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  event: Stripe.Event,
) {
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const goalId = pi.metadata?.goal_id;
    if (goalId) {
      const { error } = await supabase
        .from("goals")
        .update({
          payment_intent_id: pi.id,
          payment_status: "captured",
          payment_retry_count: 0,
          next_payment_retry_at: null,
          last_payment_error: null,
        })
        .eq("id", goalId);
      if (error) throw new Error(`Could not update captured payment status: ${error.message}`);
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const goalId = pi.metadata?.goal_id;
    const message =
      pi.last_payment_error?.message ?? "Stripe reported payment_intent.payment_failed";

    if (goalId) {
      const { data: goal, error: selectError } = await supabase
        .from("goals")
        .select("payment_retry_count")
        .eq("id", goalId)
        .single();
      if (selectError) throw new Error(`Could not load goal retry count: ${selectError.message}`);

      const retries = Number(goal?.payment_retry_count ?? 0) + 1;
      const nextRetryAt = new Date(Date.now() + Math.min(24, 2 ** retries) * 60 * 60 * 1000)
        .toISOString();

      const { error: updateError } = await supabase
        .from("goals")
        .update({
          payment_status: "payment_failed",
          payment_retry_count: retries,
          next_payment_retry_at: nextRetryAt,
          last_payment_error: message,
        })
        .eq("id", goalId);
      if (updateError) throw new Error(`Could not persist failed payment status: ${updateError.message}`);
    }
  }
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
    const start = await recordEventStart(supabase, event);
    if (!start.accepted) {
      // Already processed (or currently processing from a prior delivery). Ack safely.
      return jsonResponse({ received: true, duplicate: true });
    }

    try {
      await processEvent(supabase, event);
      await markEventProcessed(supabase, event.id);
    } catch (processingErr: unknown) {
      const processingMessage = processingErr instanceof Error
        ? processingErr.message
        : String(processingErr);
      await markEventFailed(supabase, event.id, processingMessage);
      throw processingErr;
    }

    return jsonResponse({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("stripe-webhook error:", message);
    return jsonResponse({ error: message }, 400);
  }
});
