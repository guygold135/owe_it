import Stripe from "npm:stripe@16.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

    // In-app flow: charge card and create goal (no redirect)
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
      } = body;

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

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "usd",
        payment_method: paymentMethodId,
        confirm: true,
        capture_method: "manual",
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { goal_title: goalTitle ?? "" },
      });

      if (paymentIntent.status !== "requires_capture") {
        return jsonResponse(
          { error: "Payment could not be authorized" },
          402
        );
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const stakeDollars = amountInCents / 100;

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
          payment_intent_id: paymentIntent.id,
          payment_status: "authorized",
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Goal insert error:", insertError.message);
        return jsonResponse(
          { error: "Payment succeeded but goal could not be saved" },
          500
        );
      }

      return jsonResponse({ success: true, goalId: goal.id });
    }

    // Redirect flow: create Checkout Session (legacy / optional)
    const authUserId = await getAuthenticatedUserId(req);
    if (!authUserId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { amount, goalTitle, successUrl, cancelUrl } = body;

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
            currency: "usd",
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