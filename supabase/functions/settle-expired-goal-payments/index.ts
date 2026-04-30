import Stripe from "npm:stripe@16.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createFailedStakePaymentIntent } from "../_shared/failed-stake-intent.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { chargeFailedGoalWithVaultToken, isBraintreeConfigured } from "../_shared/braintree.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("AUTO_EXPIRE_CRON_SECRET");

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function settleFailedPayment(
  stripe: Stripe | null,
  supabase: ReturnType<typeof createClient>,
  goal: {
    id: string;
    stake: number | null;
    stake_currency?: string | null;
    payment_provider?: string | null;
    payment_intent_id?: string | null;
    payment_method_id?: string | null;
    stripe_customer_id?: string | null;
    braintree_payment_method_token?: string | null;
    payment_retry_count?: number | null;
    charity_id?: string | null;
  },
) {
  const stake = Number(goal.stake ?? 0);
  if (stake <= 0) return "skipped";

  const paymentProvider = (goal.payment_provider ?? "").toLowerCase();
  const braintreeToken = goal.braintree_payment_method_token ?? null;
  if ((paymentProvider === "braintree" || braintreeToken) && isBraintreeConfigured()) {
    if (!braintreeToken) return "skipped";
    try {
      const bt = await chargeFailedGoalWithVaultToken({
        goalId: goal.id,
        amountMajor: stake,
        currencyIso: goal.stake_currency ?? "usd",
        paymentMethodToken: braintreeToken,
      });
      const { error } = await supabase
        .from("goals")
        .update({
          payment_provider: "braintree",
          braintree_transaction_id: bt.transactionId,
          braintree_transaction_status: bt.status,
          payment_status: "captured",
          payment_retry_count: 0,
          next_payment_retry_at: null,
          last_payment_error: null,
        })
        .eq("id", goal.id);
      if (error) throw new Error(`Could not persist Braintree capture: ${error.message}`);
      return "captured";
    } catch (btErr) {
      const retries = Number(goal.payment_retry_count ?? 0) + 1;
      const nextRetryAt = new Date(Date.now() + Math.min(24, 2 ** retries) * 60 * 60 * 1000).toISOString();
      await supabase
        .from("goals")
        .update({
          payment_provider: "braintree",
          payment_status: "payment_failed",
          payment_retry_count: retries,
          next_payment_retry_at: nextRetryAt,
          last_payment_error: btErr instanceof Error ? btErr.message : String(btErr),
        })
        .eq("id", goal.id);
      return "failed_needs_action";
    }
  }

  const piId = goal.payment_intent_id ?? null;
  if (piId) {
    if (!stripe) throw new Error("Stripe is not configured");
    const pi = await stripe.paymentIntents.retrieve(piId);
    const initialStatus = pi.status;
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
      return initialStatus === "succeeded" ? "already_captured" : "captured";
    }

    if (pi.status === "canceled") {
      const { error } = await supabase
        .from("goals")
        .update({ payment_status: "cancelled" })
        .eq("id", goal.id);
      if (error) throw new Error(`Could not persist cancelled status: ${error.message}`);
      return "cancelled";
    }

    return "skipped";
  }

  const paymentMethodId = goal.payment_method_id ?? null;
  const customerId = goal.stripe_customer_id ?? null;
  if (!paymentMethodId || !customerId) {
    return "skipped";
  }
  if (!stripe) throw new Error("Stripe is not configured");

  const deferredPi = await createFailedStakePaymentIntent(stripe, goal, {
    customerId,
    paymentMethodId,
    idempotencyKey: `goal-failed-${goal.id}`,
  });

  if (deferredPi.status !== "succeeded") {
    if (deferredPi.status === "requires_action" || deferredPi.status === "requires_payment_method") {
      const retries = Number(goal.payment_retry_count ?? 0) + 1;
      const nextRetryAt = new Date(Date.now() + Math.min(24, 2 ** retries) * 60 * 60 * 1000).toISOString();
      await supabase
        .from("goals")
        .update({
          payment_status: "payment_failed",
          payment_retry_count: retries,
          next_payment_retry_at: nextRetryAt,
          last_payment_error: `Deferred charge status: ${deferredPi.status}`,
        })
        .eq("id", goal.id);
      return "failed_needs_action";
    }
    return "skipped";
  }

  const { error } = await supabase
    .from("goals")
    .update({
      payment_intent_id: deferredPi.id,
      payment_status: "captured",
      payment_retry_count: 0,
      next_payment_retry_at: null,
      last_payment_error: null,
    })
    .eq("id", goal.id);
  if (error) throw new Error(`Could not persist deferred capture: ${error.message}`);
  return "captured";
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(
    req,
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  );
  if (!corsHeaders) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, corsHeaders, 405);
  }

  try {
    if ((!stripeSecret && !isBraintreeConfigured()) || !supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Server configuration missing" }, corsHeaders, 500);
    }
    if (!cronSecret) {
      return jsonResponse(
        { error: "AUTO_EXPIRE_CRON_SECRET is not configured" },
        corsHeaders,
        500
      );
    }

    // Mandatory shared-secret guard for scheduler/webhook invocations.
    const provided = req.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
    }

    const stripe = stripeSecret
      ? new Stripe(stripeSecret, {
          apiVersion: "2024-06-20",
        })
      : null;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const runStartedAt = new Date().toISOString();

    const body = await req.json().catch(() => ({}));
    const batchSizeRaw = Number((body as { batchSize?: number }).batchSize ?? 100);
    const batchSize = Number.isFinite(batchSizeRaw)
      ? Math.max(1, Math.min(500, Math.trunc(batchSizeRaw)))
      : 100;

    // First, make overdue active goals fail server-side so this works while app is down.
    const nowIso = new Date().toISOString();
    const { data: expiredGoals, error: expireError } = await supabase
      .from("goals")
      .update({ status: "failed", resolved_at: nowIso })
      .eq("status", "active")
      .lte("deadline", nowIso)
      .select("id,user_id,title,stake,is_private");

    if (expireError) {
      console.error("Expiry update failed:", expireError.message);
      return jsonResponse({ error: "Could not expire overdue goals" }, corsHeaders, 500);
    }

    const pulseRows = (expiredGoals ?? [])
      .filter((g) => !g.is_private)
      .map((g) => ({
        user_id: g.user_id,
        action: "failed",
        goal_title: g.title,
        stake: g.stake,
      }));

    if (pulseRows.length > 0) {
      const { error: pulseError } = await supabase
        .from("pulse_events")
        .insert(pulseRows);
      if (pulseError) {
        console.error("Pulse insert failed:", pulseError.message);
      }
    }

    const { data: goals, error: queryError } = await supabase
      .from("goals")
      .select("id,user_id,judge_user_id,title,payment_provider,payment_intent_id,payment_method_id,stripe_customer_id,braintree_payment_method_token,payment_status,stake,stake_currency,charity_id,payment_retry_count,next_payment_retry_at")
      .eq("status", "failed")
      .in("payment_status", ["authorized", "stored_for_later_capture", "payment_failed"])
      .or(`next_payment_retry_at.is.null,next_payment_retry_at.lte.${new Date().toISOString()}`)
      .order("resolved_at", { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (queryError) {
      console.error("Query failed:", queryError.message);
      return jsonResponse({ error: "Could not load goals to settle" }, corsHeaders, 500);
    }

    let processed = 0;
    let captured = 0;
    let alreadyCaptured = 0;
    let cancelled = 0;
    let skipped = 0;
    let errors = 0;
    let failedNeedsAction = 0;
    const runDetails: Array<{
      goal_id: string;
      result: string;
      error: string | null;
    }> = [];

    for (const goal of goals ?? []) {
      const goalId = goal.id as string;
      processed += 1;

      try {
        const result = await settleFailedPayment(stripe, supabase, goal);
        if (result === "captured") captured += 1;
        else if (result === "already_captured") alreadyCaptured += 1;
        else if (result === "cancelled") cancelled += 1;
        else if (result === "failed_needs_action") {
          failedNeedsAction += 1;
          await supabase.from("in_app_notifications").insert([
            {
              user_id: goal.user_id,
              kind: "payment_failed_goal_owner",
              title: `Payment failed for an uncompleted goal - ${goal.title}`,
              body: "",
              goal_id: goalId,
            },
            ...(goal.judge_user_id
              ? [
                  {
                    user_id: goal.judge_user_id,
                    kind: "payment_failed_goal_judge",
                    title: `Stake transfer failed - ${goal.title}`,
                    body: "",
                    goal_id: goalId,
                  },
                ]
              : []),
          ]);
        }
        else skipped += 1;
        runDetails.push({ goal_id: goalId, result, error: null });
      } catch (err: unknown) {
        errors += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Settlement failed for goal ${goalId}: ${message}`);
        runDetails.push({ goal_id: goalId, result: "error", error: message });
      }
    }

    const runEndedAt = new Date().toISOString();
    const runStatus = errors > 0 ? "partial_failure" : "success";
    const { error: auditError } = await supabase
      .from("goal_settlement_runs")
      .insert({
        started_at: runStartedAt,
        ended_at: runEndedAt,
        status: runStatus,
        trigger: "cron",
        batch_size: batchSize,
        expired_count: (expiredGoals ?? []).length,
        processed_count: processed,
        captured_count: captured,
        already_captured_count: alreadyCaptured,
        cancelled_count: cancelled,
        skipped_count: skipped,
        error_count: errors,
        details: runDetails,
      });
    if (auditError) {
      console.error("Could not persist settlement run audit:", auditError.message);
    }

    return jsonResponse({
      success: true,
      expired: (expiredGoals ?? []).length,
      processed,
      captured,
      alreadyCaptured,
      cancelled,
      failedNeedsAction,
      skipped,
      errors,
    }, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("settle-expired-goal-payments error:", message);
    return jsonResponse({ error: message }, corsHeaders, 500);
  }
});
