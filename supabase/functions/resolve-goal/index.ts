import Stripe from "npm:stripe@16.6.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
    if (!stripeSecret) return jsonResponse({ error: "Stripe not configured" }, 500);
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase not configured" }, 500);
    }

    const body = await req.json();
    const { resolveTokenId } = body as { resolveTokenId?: string };
    if (!resolveTokenId || typeof resolveTokenId !== "string") {
      return jsonResponse({ error: "Missing resolveTokenId" }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: token, error: tokenError } = await supabase
      .from("goal_resolve_tokens")
      .select("id, goal_id, outcome, judge_user_id, used_at")
      .eq("id", resolveTokenId)
      .single();

    if (tokenError || !token) return jsonResponse({ error: "Invalid or expired token" }, 400);
    if (token.used_at) return jsonResponse({ error: "Token already used" }, 400);

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id,user_id,title,stake,deadline,status,is_private,judge_user_id,payment_intent_id,payment_status")
      .eq("id", token.goal_id)
      .single();

    if (goalError || !goal) return jsonResponse({ error: "Goal not found" }, 404);
    if (goal.judge_user_id !== token.judge_user_id) return jsonResponse({ error: "Forbidden" }, 403);
    if (goal.status !== "active") return jsonResponse({ error: "Goal already resolved" }, 409);

    const outcome = token.outcome as "completed" | "failed";
    const goalId = goal.id;

    // Mark token used immediately to prevent reuse
    await supabase
      .from("goal_resolve_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resolveTokenId);

    // Settle payment if needed
    const stake = Number(goal.stake ?? 0);
    const piId = goal.payment_intent_id as string | null;
    if (stake > 0 && piId) {
      if (outcome === "failed") {
        await stripe.paymentIntents.capture(piId);
        await supabase.from("goals").update({ payment_status: "captured" }).eq("id", goalId);
      } else {
        await stripe.paymentIntents.cancel(piId);
        await supabase.from("goals").update({ payment_status: "cancelled" }).eq("id", goalId);
      }
    }

    const newStatus = outcome === "completed" ? "completed" : "failed";
    const { error: updateError } = await supabase
      .from("goals")
      .update({ status: newStatus, resolved_at: new Date().toISOString(), resolved_by: token.judge_user_id })
      .eq("id", goalId);
    if (updateError) return jsonResponse({ error: "Could not update goal" }, 500);

    if (!goal.is_private) {
      const action = outcome === "completed" ? "completed" : "failed";
      await supabase.from("pulse_events").insert({
        user_id: goal.user_id,
        action,
        goal_title: goal.title,
        stake,
      });
    }

    return jsonResponse({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Resolve goal error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
