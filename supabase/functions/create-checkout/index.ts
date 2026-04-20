import Stripe from "npm:stripe@16.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  normalizeStakeCurrency as normalizeStakeCurrencyShared,
  resolveMinimumStakeMajor,
  stakeMajorToStripeUnits,
  stripeUnitsToStakeMajor,
} from "../_shared/stripe-money.ts";
import { DEFAULT_CHARITY_ID, isValidCharityId } from "../_shared/charities.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

const stripe = new Stripe(stripeSecret ?? "", {
  apiVersion: "2024-06-20",
});

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

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

/** Returns authenticated user id or null; use when JWT verification is OFF (auth in code). */
async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !supabaseUrl) return null;
  const token = authHeader.slice(7);
  const keysToTry = [supabaseAnonKey, supabaseServiceKey].filter(
    (key): key is string => typeof key === "string" && key.length > 0,
  );
  for (const key of keysToTry) {
    const authClient = createClient(supabaseUrl, key);
    const { data: { user }, error } = await authClient.auth.getUser(token);
    if (!error && user?.id) return user.id;
  }
  return null;
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
    if (!stripeSecret) {
      return jsonResponse(
        { error: "Stripe secret key not configured" },
        500
      );
    }

    const body = await req.json();

    // In-app flow: store payment method now, charge only on failed/expired outcome.
    if (body.paymentMethodId) {
      const authUserId = await getAuthenticatedUserId(req);
      if (!authUserId) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const {
        paymentMethodId,
        userId,
        goalTitle,
        description,
        deadline,
        judgeName,
        judgeUserId,
        isPrivate,
        amount: stripeAmountRaw,
        currency,
        charityId: charityIdRaw,
      } = body;

      const normalizedCurrency = normalizeStakeCurrencyShared(currency);
      const charityId =
        typeof charityIdRaw === "string" && isValidCharityId(charityIdRaw)
          ? charityIdRaw
          : DEFAULT_CHARITY_ID;

      if (
        !paymentMethodId ||
        !userId ||
        !goalTitle ||
        typeof stripeAmountRaw !== "number" ||
        !Number.isFinite(stripeAmountRaw) ||
        stripeAmountRaw <= 0
      ) {
        return jsonResponse(
          { error: "Missing or invalid fields for in-app payment" },
          400
        );
      }

      const stakeMajor = stripeUnitsToStakeMajor(
        Math.trunc(stripeAmountRaw),
        normalizedCurrency,
      );
      const minMajor = await resolveMinimumStakeMajor(normalizedCurrency);
      if (stakeMajor > 0 && stakeMajor + 1e-9 < minMajor) {
        return jsonResponse(
          {
            error:
              `Minimum stake is ${minMajor} ${normalizedCurrency.toUpperCase()} (at least US$1).`,
          },
          400,
        );
      }

      const expectedUnits = stakeMajorToStripeUnits(stakeMajor, normalizedCurrency);
      if (Math.trunc(stripeAmountRaw) !== expectedUnits) {
        return jsonResponse({ error: "Invalid stake amount for currency" }, 400);
      }

      if (userId !== authUserId) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      if (!supabaseUrl || !supabaseServiceKey) {
        return jsonResponse(
          { error: "Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
          500
        );
      }

      const existingPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      let customerId = typeof existingPaymentMethod.customer === "string"
        ? existingPaymentMethod.customer
        : null;

      if (!customerId) {
        try {
          const customer = await stripe.customers.create({
            metadata: {
              app_user_id: userId,
            },
          });
          customerId = customer.id;
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
          });
        } catch (attachErr) {
          return jsonResponse(
            {
              error: errorMessage(attachErr, "Could not attach payment method to a Stripe customer"),
              stage: "attach_payment_method",
            },
            500,
          );
        }
      }

      try {
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      } catch (customerUpdateErr) {
        return jsonResponse(
          {
            error: errorMessage(customerUpdateErr, "Could not update the Stripe customer"),
            stage: "update_customer",
          },
          500,
        );
      }

      // Best-effort validation for future off-session usage.
      // Don't block goal creation if additional authentication is required now.
      try {
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          payment_method: paymentMethodId,
          usage: "off_session",
          confirm: true,
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: "never",
          },
        });
        if (
          setupIntent.status !== "succeeded" &&
          setupIntent.status !== "requires_action"
        ) {
          console.warn(
            `SetupIntent for deferred charge was not fully confirmed (status: ${setupIntent.status})`
          );
        }
      } catch (setupErr) {
        console.warn("SetupIntent validation failed; continuing with stored payment method:", setupErr);
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const buildInsertPayload = (opts?: {
        includeCurrency?: boolean;
        includeCharity?: boolean;
        includeJudgeUserId?: boolean;
        includeDeferredPaymentFields?: boolean;
      }): Record<string, unknown> => ({
        user_id: userId,
        title: goalTitle,
        description: description ?? "",
        stake: stakeMajor,
        deadline: deadline,
        status: "active",
        judge_name: judgeName ?? null,
        ...(opts?.includeJudgeUserId === false ? {} : { judge_user_id: judgeUserId ?? null }),
        is_private: !!isPrivate,
        ...(opts?.includeCurrency === false ? {} : { stake_currency: normalizedCurrency }),
        ...(opts?.includeDeferredPaymentFields === false
          ? {}
          : {
              stripe_customer_id: customerId,
              payment_method_id: paymentMethodId,
              payment_status: "stored_for_later_capture",
            }),
        ...(opts?.includeCharity === false ? {} : { charity_id: charityId }),
      });

      let { data: goal, error: insertError } = await supabase
        .from("goals")
        .insert(
          buildInsertPayload({
            includeCurrency: true,
            includeCharity: true,
            includeJudgeUserId: true,
            includeDeferredPaymentFields: true,
          }),
        )
        .select("id")
        .single();

      const insertErrorMessage = String(insertError?.message ?? "").toLowerCase();
      if (insertError && insertErrorMessage.includes("charity_id")) {
        const retry = await supabase
          .from("goals")
          .insert(
            buildInsertPayload({
              includeCurrency: true,
              includeCharity: false,
              includeJudgeUserId: true,
              includeDeferredPaymentFields: true,
            }),
          )
          .select("id")
          .single();
        goal = retry.data;
        insertError = retry.error;
      }

      const insertErrorMessageAfterCharity = String(insertError?.message ?? "").toLowerCase();
      if (insertError && insertErrorMessageAfterCharity.includes("stake_currency")) {
        const retry = await supabase
          .from("goals")
          .insert(
            buildInsertPayload({
              includeCurrency: false,
              includeCharity: false,
              includeJudgeUserId: true,
              includeDeferredPaymentFields: true,
            }),
          )
          .select("id")
          .single();
        goal = retry.data;
        insertError = retry.error;
      }

      const insertErrorMessageAfterCurrency = String(insertError?.message ?? "").toLowerCase();
      if (insertError && insertErrorMessageAfterCurrency.includes("judge_user_id")) {
        const retry = await supabase
          .from("goals")
          .insert(
            buildInsertPayload({
              includeCurrency: false,
              includeCharity: false,
              includeJudgeUserId: false,
              includeDeferredPaymentFields: true,
            }),
          )
          .select("id")
          .single();
        goal = retry.data;
        insertError = retry.error;
      }

      const insertErrorMessageAfterJudge = String(insertError?.message ?? "").toLowerCase();
      if (
        insertError &&
        (insertErrorMessageAfterJudge.includes("payment_method_id") ||
          insertErrorMessageAfterJudge.includes("stripe_customer_id") ||
          insertErrorMessageAfterJudge.includes("payment_status"))
      ) {
        const retry = await supabase
          .from("goals")
          .insert(
            buildInsertPayload({
              includeCurrency: false,
              includeCharity: false,
              includeJudgeUserId: false,
              includeDeferredPaymentFields: false,
            }),
          )
          .select("id")
          .single();
        goal = retry.data;
        insertError = retry.error;
      }

      let goalId = goal?.id as string | undefined;
      if (insertError) {
        // Roll back attached payment method on DB failure to avoid orphans.
        try {
          await stripe.paymentMethods.detach(paymentMethodId);
        } catch (detachErr) {
          console.error("Could not detach payment method after failed goal insert:", detachErr);
        }
        console.error("Goal insert error:", insertError.message);
        return jsonResponse(
          {
            error: errorMessage(insertError, "Payment method saved but goal could not be saved"),
            stage: "insert_goal",
          },
          500
        );
      }

      return jsonResponse({ success: true, goalId });
    }

    // Redirect flow: create Checkout Session (legacy / optional)
    const authUserId = await getAuthenticatedUserId(req);
    if (!authUserId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { amount, goalTitle, successUrl, cancelUrl } = body;
    const normalizedCurrency = normalizeStakeCurrencyShared(body?.currency);

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return jsonResponse({ error: "Invalid amount" }, 400);
    }

    const checkoutStakeMajor = stripeUnitsToStakeMajor(Math.trunc(amount), normalizedCurrency);
    const checkoutMin = await resolveMinimumStakeMajor(normalizedCurrency);
    if (checkoutStakeMajor > 0 && checkoutStakeMajor + 1e-9 < checkoutMin) {
      return jsonResponse(
        {
          error:
            `Minimum stake is ${checkoutMin} ${normalizedCurrency.toUpperCase()} (at least US$1).`,
        },
        400,
      );
    }
    if (stakeMajorToStripeUnits(checkoutStakeMajor, normalizedCurrency) !== Math.trunc(amount)) {
      return jsonResponse({ error: "Invalid amount for currency" }, 400);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: normalizedCurrency,
            product_data: {
              name: goalTitle || "Goal stake",
            },
            unit_amount: Math.trunc(amount),
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return jsonResponse({ sessionUrl: session.url });
  } catch (err: any) {
    console.error("Stripe error:", err?.message ?? err);
    return jsonResponse(
      { error: err?.message ?? "Unknown Stripe error", stage: "unexpected" },
      500
    );
  }
});