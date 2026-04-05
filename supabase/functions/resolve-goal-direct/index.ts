import Stripe from "npm:stripe@16.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createFailedStakePaymentIntent } from "../_shared/failed-stake-intent.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
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

// Important: the frontend treats non-2xx as a transport error.
// We always respond with HTTP 200 and put success/error in the JSON body.
function jsonOk(body: unknown) {
  return jsonResponse(body, 200);
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

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !supabaseUrl || !supabaseServiceKey) return null;

  const token = authHeader.slice(7);
  // Use the service role key so this works even if SUPABASE_ANON_KEY isn't set.
  const authClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.id) return null;
  return user.id;
}

serve(async (req: Request): Promise<Response> => {
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
    if (!stripeSecret) return jsonOk({ success: false, error: "Stripe not configured" });
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonOk({ success: false, error: "Supabase not configured" });
    }

    // Lazy-load Stripe only after we verify the secret exists.
    // If the secret is empty/missing, constructing the client can crash at module init.
    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2024-06-20",
    });

    const authUserId = await getAuthenticatedUserId(req);
    if (!authUserId) return jsonOk({ success: false, error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const { goalId, outcome } = body as { goalId?: string; outcome?: "completed" | "failed" };

    if (!goalId || typeof goalId !== "string") {
      return jsonOk({ success: false, error: "Missing goalId" });
    }
    if (outcome !== "completed" && outcome !== "failed") {
      return jsonOk({ success: false, error: "Missing or invalid outcome" });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id,user_id,title,stake,stake_currency,charity_id,deadline,status,is_private,judge_user_id,payment_intent_id,payment_method_id,stripe_customer_id,payment_status")
      .eq("id", goalId)
      .single();

    if (goalError || !goal) return jsonOk({ success: false, error: "Goal not found" });
    if (goal.status !== "active") return jsonOk({ success: false, error: "Goal already resolved" });

    const deadlineMs = new Date(goal.deadline as string).getTime();
    const isPastDeadline = deadlineMs <= Date.now();
    const isJudge = goal.judge_user_id === authUserId;
    const isOwner = goal.user_id === authUserId;

    // Completed: only the assigned judge (before or after deadline).
    if (outcome === "completed") {
      if (!isJudge) return jsonOk({ success: false, error: "Forbidden (not the judge)" });
    }

    // Failed (uncompleted):
    // - Judge can always mark failed.
    // - If the deadline has passed, the goal owner may also finalize as failed (auto-expire path).
    // - Before deadline, only the judge may mark failed.
    if (outcome === "failed") {
      if (isJudge) {
        // ok
      } else if (isPastDeadline && isOwner) {
        // ok — owner-triggered expiry after deadline
      } else {
        return jsonOk({ success: false, error: "Forbidden (not allowed to mark uncompleted)" });
      }
    }

    const stake = Number(goal.stake ?? 0);

    // Settle payment if needed
    if (stake > 0) {
      if (outcome === "failed") {
        await settleFailedPayment(stripe, supabase, goal);
      } else {
        const piId = goal.payment_intent_id as string | null;
        if (!piId) {
          await supabase.from("goals").update({ payment_status: "not_charged_completed" }).eq("id", goal.id);
        } else {
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (pi.status === "requires_capture") {
            await stripe.paymentIntents.cancel(piId);
            await supabase.from("goals").update({ payment_status: "cancelled" }).eq("id", goal.id);
          } else if (pi.status === "succeeded") {
            await stripe.refunds.create({ payment_intent: piId });
            await supabase.from("goals").update({ payment_status: "refunded" }).eq("id", goal.id);
          }
        }
      }
    }

    const newStatus = outcome === "completed" ? "completed" : "failed";
    const { error: updateError } = await supabase
      .from("goals")
      .update({ status: newStatus, resolved_at: new Date().toISOString(), resolved_by: authUserId })
      .eq("id", goal.id);

    if (updateError) return jsonOk({ success: false, error: "Could not update goal" });

    // Social Pulse event (skip private goals)
    if (!goal.is_private) {
      await supabase.from("pulse_events").insert({
        user_id: goal.user_id,
        action: outcome,
        goal_title: goal.title,
        stake,
      });
    }

    return jsonOk({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Resolve goal-direct error:", message);
    return jsonOk({ success: false, error: message });
  }
});

