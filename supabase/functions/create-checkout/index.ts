import Stripe from "npm:stripe@16.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

const supportedCurrencies = new Set([
  "usd",
  "eur",
  "gbp",
  "cad",
  "aud",
  "nzd",
  "chf",
  "sek",
  "nok",
  "dkk",
  "pln",
  "czk",
  "huf",
  "ron",
  "bgn",
  "hrk",
  "isk",
  "try",
  "ils",
  "aed",
  "sar",
  "qar",
  "bhd",
  "omr",
  "jod",
  "egp",
  "mad",
  "zar",
  "kes",
  "ngn",
  "inr",
  "pkr",
  "bdt",
  "lkr",
  "thb",
  "myr",
  "sgd",
  "hkd",
  "jpy",
  "twd",
  "krw",
  "vnd",
  "php",
  "idr",
  "brl",
  "mxn",
  "ars",
  "clp",
  "cop",
  "pen",
  "uyu",
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/** Returns authenticated user id or null; use when JWT verification is OFF (auth in code). */
async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !supabaseUrl || !supabaseAnonKey) return null;
  const token = authHeader.slice(7);
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
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
        amount: amountInCents,
        currency,
        stakeRecipientUserId: stakeRecipientUserIdRaw,
        stakeCharityId: stakeCharityIdRaw,
      } = body as {
        paymentMethodId?: string;
        userId?: string;
        goalTitle?: string;
        description?: string;
        deadline?: string;
        judgeName?: string | null;
        judgeUserId?: string | null;
        isPrivate?: boolean;
        amount?: number;
        currency?: string;
        stakeRecipientUserId?: string | null;
        stakeCharityId?: string | null;
      };

      const normalizedCurrency =
        typeof currency === "string" && supportedCurrencies.has(currency.toLowerCase())
          ? currency.toLowerCase()
          : "usd";

      if (
        !paymentMethodId ||
        !userId ||
        !goalTitle ||
        typeof amountInCents !== "number" ||
        !Number.isFinite(amountInCents) ||
        amountInCents <= 0
      ) {
        return jsonResponse(
          { error: "Missing or invalid fields for in-app payment" },
          400
        );
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
        const customer = await stripe.customers.create({
          metadata: {
            app_user_id: userId,
          },
        });
        customerId = customer.id;
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });
      }

      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

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
      const stakeDollars = amountInCents / 100;

      const hasFriend =
        stakeRecipientUserIdRaw !== undefined &&
        stakeRecipientUserIdRaw !== null &&
        stakeRecipientUserIdRaw !== "";
      const hasCharity =
        stakeCharityIdRaw !== undefined &&
        stakeCharityIdRaw !== null &&
        stakeCharityIdRaw !== "";

      if (hasFriend && hasCharity) {
        return jsonResponse(
          { error: "Choose either a friend or a charity, not both" },
          400,
        );
      }

      let stakeRecipientUserId: string | null = null;
      let stakeCharityId: string | null = null;

      if (hasFriend) {
        if (typeof stakeRecipientUserIdRaw !== "string") {
          return jsonResponse({ error: "Invalid stake recipient" }, 400);
        }
        if (stakeRecipientUserIdRaw === userId) {
          return jsonResponse({ error: "Stake cannot go to yourself" }, 400);
        }
        const { data: edge } = await supabase
          .from("friendships")
          .select("friend_user_id")
          .eq("user_id", userId)
          .eq("friend_user_id", stakeRecipientUserIdRaw)
          .maybeSingle();
        if (!edge?.friend_user_id) {
          return jsonResponse({ error: "Stake recipient must be one of your friends" }, 400);
        }
        const { data: recipient } = await supabase
          .from("profiles")
          .select("id, stake_payouts_ready, stripe_connect_account_id")
          .eq("id", stakeRecipientUserIdRaw)
          .maybeSingle();
        if (
          !recipient?.stake_payouts_ready ||
          !recipient?.stripe_connect_account_id
        ) {
          return jsonResponse(
            { error: "That friend has not finished bank setup to receive stakes" },
            400,
          );
        }
        stakeRecipientUserId = stakeRecipientUserIdRaw;
      }

      if (hasCharity) {
        if (typeof stakeCharityIdRaw !== "string") {
          return jsonResponse({ error: "Invalid charity" }, 400);
        }
        const { data: charity } = await supabase
          .from("charities")
          .select("id, active, stake_payouts_ready, stripe_connect_account_id")
          .eq("id", stakeCharityIdRaw)
          .maybeSingle();
        if (
          !charity?.active ||
          !charity?.stake_payouts_ready ||
          !charity?.stripe_connect_account_id
        ) {
          return jsonResponse(
            { error: "That charity is not available to receive stakes yet" },
            400,
          );
        }
        stakeCharityId = stakeCharityIdRaw;
      }

      const { data: goal, error: insertError } = await supabase
        .from("goals")
        .insert({
          user_id: userId,
          title: goalTitle,
          description: description ?? "",
          stake: stakeDollars,
          deadline: deadline,
          status: "active",
          judge_name: judgeName ?? null,
          judge_user_id: judgeUserId ?? null,
          is_private: !!isPrivate,
          stake_currency: normalizedCurrency,
          stripe_customer_id: customerId,
          payment_method_id: paymentMethodId,
          payment_status: "stored_for_later_capture",
          stake_recipient_user_id: stakeRecipientUserId,
          stake_charity_id: stakeCharityId,
        })
        .select("id")
        .single();

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
          { error: "Payment method saved but goal could not be saved" },
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
    const normalizedCurrency =
      typeof body?.currency === "string" && supportedCurrencies.has(body.currency.toLowerCase())
        ? body.currency.toLowerCase()
        : "usd";

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return jsonResponse({ error: "Invalid amount" }, 400);
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
            unit_amount: amount,
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
      { error: err?.message ?? "Unknown Stripe error" },
      500
    );
  }
});