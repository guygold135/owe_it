import Stripe from "npm:stripe@16.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createFailedStakePaymentIntent } from "../_shared/failed-stake-intent.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  chargeFailedGoalWithVaultToken,
  getBraintreeDebugContext,
  isBraintreeConfigured,
  upsertVaultedPaymentMethod,
} from "../_shared/braintree.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !supabaseUrl || !supabaseAnonKey) return null;
  const token = authHeader.slice(7);
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);
  if (error || !user?.id) return null;
  return user.id;
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(req);
  if (!corsHeaders) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, corsHeaders, 405);

  try {
    if ((!stripeSecret && !isBraintreeConfigured()) || !supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Server configuration missing" }, corsHeaders, 500);
    }
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);

    const { goalId, paymentMethodId, paymentMethodNonce } = (await req.json().catch(() => ({}))) as {
      goalId?: string;
      paymentMethodId?: string;
      paymentMethodNonce?: string;
    };
    if (!goalId || (!paymentMethodId && !paymentMethodNonce)) {
      return jsonResponse({ error: "Missing goalId and payment method payload" }, corsHeaders, 400);
    }

    const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: goal, error: goalError } = await admin
      .from("goals")
      .select("id,user_id,judge_user_id,title,stake,stake_currency,charity_id,status,payment_status,payment_provider,braintree_customer_id,braintree_payment_method_token,stripe_customer_id")
      .eq("id", goalId)
      .maybeSingle();
    if (goalError || !goal) return jsonResponse({ error: "Goal not found" }, corsHeaders, 404);
    if (goal.user_id !== userId) return jsonResponse({ error: "Forbidden" }, corsHeaders, 403);
    if (goal.status !== "failed") return jsonResponse({ error: "Goal is not uncompleted" }, corsHeaders, 400);
    if (Number(goal.stake ?? 0) <= 0) return jsonResponse({ error: "Goal has no stake" }, corsHeaders, 400);

    if (isBraintreeConfigured() && paymentMethodNonce) {
      console.log("retry_failed_goal_payment.braintree_attempt", {
        goalId,
        userId,
        goalStake: Number(goal.stake ?? 0),
        goalCurrency: goal.stake_currency ?? null,
        ...getBraintreeDebugContext(goal.stake_currency ?? "usd"),
      });
      const vaulted = await upsertVaultedPaymentMethod({
        appUserId: userId,
        paymentMethodNonce,
      });

      try {
        const bt = await chargeFailedGoalWithVaultToken({
          goalId: goal.id,
          amountMajor: Number(goal.stake),
          currencyIso: goal.stake_currency ?? "usd",
          paymentMethodToken: vaulted.paymentMethodToken,
        });
        await admin
          .from("goals")
          .update({
            payment_provider: "braintree",
            braintree_customer_id: vaulted.customerId,
            braintree_payment_method_token: vaulted.paymentMethodToken,
            braintree_transaction_id: bt.transactionId,
            braintree_transaction_status: bt.status,
            payment_status: "captured",
            payment_retry_count: 0,
            next_payment_retry_at: null,
            last_payment_error: null,
          })
          .eq("id", goal.id);
      } catch (btErr) {
        const btErrorMessage = btErr instanceof Error ? btErr.message : String(btErr);
        const btDebugContext = getBraintreeDebugContext(goal.stake_currency ?? "usd");
        console.error("retry_failed_goal_payment.braintree_failed", {
          goalId: goal.id,
          userId,
          goalStake: Number(goal.stake ?? 0),
          goalCurrency: goal.stake_currency ?? null,
          ...btDebugContext,
          error: btErrorMessage,
        });
        await admin
          .from("goals")
          .update({
            payment_provider: "braintree",
            braintree_customer_id: vaulted.customerId,
            braintree_payment_method_token: vaulted.paymentMethodToken,
            payment_status: "payment_failed",
            payment_retry_count: Number((goal as { payment_retry_count?: number | null }).payment_retry_count ?? 0) + 1,
            next_payment_retry_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            last_payment_error: btErrorMessage,
          })
          .eq("id", goal.id);
        return jsonResponse(
          {
            success: false,
            error: btErrorMessage,
            debug: {
              provider: "braintree",
              environment: btDebugContext.environment,
              currency: btDebugContext.currency,
              merchantAccountId: btDebugContext.merchantAccountId,
            },
          },
          corsHeaders,
          409,
        );
      }
    } else {
      if (!stripe || !paymentMethodId) {
        return jsonResponse({ error: "Retry payment method is not available" }, corsHeaders, 400);
      }
      let customerId = goal.stripe_customer_id as string | null;
      if (!customerId) {
        const customer = await stripe.customers.create({ metadata: { app_user_id: userId } });
        customerId = customer.id;
      }

      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      const deferredPi = await createFailedStakePaymentIntent(stripe, goal, {
        customerId,
        paymentMethodId,
        idempotencyKey: `goal-retry-failed-${goal.id}-${Date.now()}`,
      });

      if (deferredPi.status !== "succeeded") {
        await admin
          .from("goals")
          .update({
            payment_status: "payment_failed",
            payment_method_id: paymentMethodId,
            stripe_customer_id: customerId,
            payment_retry_count: Number((goal as { payment_retry_count?: number | null }).payment_retry_count ?? 0) + 1,
            next_payment_retry_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            last_payment_error: `Retry status: ${deferredPi.status}`,
          })
          .eq("id", goal.id);
        return jsonResponse({ success: false, error: `Retry failed (${deferredPi.status})` }, corsHeaders, 409);
      }

      await admin
        .from("goals")
        .update({
          payment_intent_id: deferredPi.id,
          payment_status: "captured",
          payment_method_id: paymentMethodId,
          stripe_customer_id: customerId,
          payment_retry_count: 0,
          next_payment_retry_at: null,
          last_payment_error: null,
        })
        .eq("id", goal.id);
    }

    await admin
      .from("in_app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("goal_id", goal.id)
      .in("kind", ["payment_failed_goal_owner", "payment_failed_goal_judge"])
      .is("read_at", null);

    return jsonResponse({ success: true }, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, corsHeaders, 500);
  }
});

