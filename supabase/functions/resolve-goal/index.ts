import Stripe from "npm:stripe@16.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createFailedStakePaymentIntent } from "../_shared/failed-stake-intent.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(stripeSecret ?? "", {
  apiVersion: "2024-06-20",
});

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function settleFailedPayment(
  stripe: Stripe,
  supabase: ReturnType<typeof createClient>,
  goal: {
    id: string;
    stake: number | null;
    stake_currency?: string | null;
    payment_intent_id?: string | null;
    payment_method_id?: string | null;
    stripe_customer_id?: string | null;
    charity_id?: string | null;
  },
) {
  const stake = Number(goal.stake ?? 0);
  if (stake <= 0) return;

  const piId = goal.payment_intent_id ?? null;
  if (piId) {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status === "requires_capture") {
      await stripe.paymentIntents.capture(piId, {
        idempotencyKey: `goal-capture-${goal.id}`,
      });
    }
    if (pi.status === "requires_capture" || pi.status === "succeeded") {
      const { error } = await supabase
        .from("goals")
        .update({ payment_status: "captured" })
        .eq("id", goal.id);
      if (error) throw new Error(`Could not persist captured status: ${error.message}`);
      return;
    }
    if (pi.status === "canceled") {
      const { error } = await supabase
        .from("goals")
        .update({ payment_status: "cancelled" })
        .eq("id", goal.id);
      if (error) throw new Error(`Could not persist cancelled status: ${error.message}`);
      return;
    }
    throw new Error(`Payment intent is not capturable (status: ${pi.status})`);
  }

  const paymentMethodId = goal.payment_method_id ?? null;
  const customerId = goal.stripe_customer_id ?? null;
  if (!paymentMethodId || !customerId) {
    throw new Error("Missing payment method for deferred charge");
  }

  const deferredPi = await createFailedStakePaymentIntent(stripe, goal, {
    customerId,
    paymentMethodId,
    idempotencyKey: `goal-failed-${goal.id}`,
  });

  if (deferredPi.status !== "succeeded") {
    throw new Error(`Deferred capture failed (status: ${deferredPi.status})`);
  }

  const { error } = await supabase
    .from("goals")
    .update({
      payment_intent_id: deferredPi.id,
      payment_status: "captured",
    })
    .eq("id", goal.id);
  if (error) throw new Error(`Could not persist deferred capture: ${error.message}`);
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(req);
  if (!corsHeaders) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    if (!stripeSecret) return jsonResponse({ error: "Stripe not configured" }, corsHeaders, 500);
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase not configured" }, corsHeaders, 500);
    }

    const body = await req.json();
    const { resolveTokenId } = body as { resolveTokenId?: string };
    if (!resolveTokenId || typeof resolveTokenId !== "string") {
      return jsonResponse({ error: "Missing resolveTokenId" }, corsHeaders, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: token, error: tokenError } = await supabase
      .from("goal_resolve_tokens")
      .select("id, goal_id, outcome, judge_user_id, used_at")
      .eq("id", resolveTokenId)
      .single();

    if (tokenError || !token) return jsonResponse({ error: "Invalid or expired token" }, corsHeaders, 400);
    if (token.used_at) return jsonResponse({ error: "Token already used" }, corsHeaders, 400);

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id,user_id,title,stake,stake_currency,charity_id,deadline,status,is_private,judge_user_id,payment_intent_id,payment_method_id,stripe_customer_id,payment_status")
      .eq("id", token.goal_id)
      .single();

    if (goalError || !goal) return jsonResponse({ error: "Goal not found" }, corsHeaders, 404);
    if (goal.judge_user_id !== token.judge_user_id) return jsonResponse({ error: "Forbidden" }, corsHeaders, 403);
    if (goal.status !== "active") return jsonResponse({ error: "Goal already resolved" }, corsHeaders, 409);

    const outcome = token.outcome as "completed" | "failed";
    const goalId = goal.id;

    // Settle payment if needed
    const stake = Number(goal.stake ?? 0);
    if (stake > 0) {
      if (outcome === "failed") {
        await settleFailedPayment(stripe, supabase, goal);
      } else {
        const piId = goal.payment_intent_id as string | null;
        if (!piId) {
          await supabase.from("goals").update({ payment_status: "not_charged_completed" }).eq("id", goalId);
        } else {
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (pi.status === "requires_capture") {
            await stripe.paymentIntents.cancel(piId);
            await supabase.from("goals").update({ payment_status: "cancelled" }).eq("id", goalId);
          } else if (pi.status === "succeeded") {
            await stripe.refunds.create({ payment_intent: piId });
            await supabase.from("goals").update({ payment_status: "refunded" }).eq("id", goalId);
          }
        }
      }
    }

    const newStatus = outcome === "completed" ? "completed" : "failed";
    const { error: updateError } = await supabase
      .from("goals")
      .update({ status: newStatus, resolved_at: new Date().toISOString(), resolved_by: token.judge_user_id })
      .eq("id", goalId);
    if (updateError) return jsonResponse({ error: "Could not update goal" }, corsHeaders, 500);

    // Mark token as used only after successful settlement + goal update.
    // This keeps the flow retry-safe if Stripe/database steps fail mid-way.
    const { error: consumeTokenError } = await supabase
      .from("goal_resolve_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resolveTokenId)
      .is("used_at", null);
    if (consumeTokenError) {
      return jsonResponse({ error: "Could not finalize resolve token" }, corsHeaders, 500);
    }

    if (!goal.is_private) {
      const action = outcome === "completed" ? "completed" : "failed";
      await supabase.from("pulse_events").insert({
        user_id: goal.user_id,
        action,
        goal_title: goal.title,
        stake,
      });
    }

    return jsonResponse({ success: true }, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Resolve goal error:", message);
    return jsonResponse({ error: message }, corsHeaders, 500);
  }
});
