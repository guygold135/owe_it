import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

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
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Server configuration missing" }, corsHeaders, 500);
    }
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: goal, error } = await admin
      .from("goals")
      .select("id,title,user_id,judge_user_id,stake,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !goal) return jsonResponse({ error: "No goals found for user" }, corsHeaders, 404);

    await admin
      .from("goals")
      .update({
        status: "failed",
        resolved_at: new Date().toISOString(),
        payment_status: "payment_failed",
        last_payment_error: "Debug: simulated failed transfer",
        next_payment_retry_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .eq("id", goal.id);

    await admin.from("in_app_notifications").insert([
      {
        user_id: goal.user_id,
        kind: "payment_failed_goal_owner",
        title: `Payment failed for an uncompleted goal - ${goal.title}`,
        body: "",
        goal_id: goal.id,
      },
      ...(goal.judge_user_id
        ? [
            {
              user_id: goal.judge_user_id,
              kind: "payment_failed_goal_judge",
              title: `Stake transfer failed - ${goal.title}`,
              body: "",
              goal_id: goal.id,
            },
          ]
        : []),
    ]);

    return jsonResponse({ success: true, goalId: goal.id }, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, corsHeaders, 500);
  }
});

