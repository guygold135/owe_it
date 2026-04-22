import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

/**
 * Permanent account deletion for the currently signed-in user.
 *
 * Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (set automatically when deployed).
 *
 * Maintainer: deploy after changes:
 *   supabase functions deploy delete-account
 */

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

async function purgePublicUserData(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ error: string | null }> {
  const steps: Array<() => Promise<{ error: { message: string } | null }>> = [
    () => admin.from("feedback_submissions").delete().eq("user_id", userId),
    () => admin.from("in_app_notifications").delete().eq("user_id", userId),
    () => admin.from("pulse_events").delete().eq("user_id", userId),
    () =>
      admin
        .from("friend_requests")
        .delete()
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`),
    () =>
      admin
        .from("friendships")
        .delete()
        .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`),
    () =>
      admin
        .from("judge_requests")
        .delete()
        .or(`requester_user_id.eq.${userId},judge_user_id.eq.${userId}`),
    () => admin.from("goals").delete().eq("user_id", userId),
  ];

  for (const step of steps) {
    const { error } = await step();
    if (error) {
      return { error: error.message };
    }
  }
  return { error: null };
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
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(
        { error: "Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        corsHeaders,
        500,
      );
    }

    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: judgeBlockers, error: judgeBlockersError } = await admin
      .from("goals")
      .select("id")
      .eq("judge_user_id", userId)
      .neq("user_id", userId)
      .eq("status", "active")
      .gt("stake", 0)
      .limit(1);

    if (judgeBlockersError) {
      console.error("delete-account judge blocker check:", judgeBlockersError.message);
      return jsonResponse(
        { error: "Could not verify judge commitments. Try again in a moment." },
        corsHeaders,
        500,
      );
    }
    if (judgeBlockers && judgeBlockers.length > 0) {
      return jsonResponse(
        {
          error:
            "You are still the judge on an active staked goal owned by someone else. Finish judging those goals first, then try again.",
        },
        corsHeaders,
        409,
      );
    }

    const { data: ownActiveStakedGoals, error: ownActiveStakedGoalsError } = await admin
      .from("goals")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("stake", 0)
      .limit(1);

    if (ownActiveStakedGoalsError) {
      console.error("delete-account own active staked goals check:", ownActiveStakedGoalsError.message);
      return jsonResponse(
        { error: "Could not verify your active staked goals. Try again in a moment." },
        corsHeaders,
        500,
      );
    }

    if (ownActiveStakedGoals && ownActiveStakedGoals.length > 0) {
      return jsonResponse(
        {
          error:
            "You still have active staked goals. Resolve or finish those goals first, then try again.",
        },
        corsHeaders,
        409,
      );
    }

    const purge = await purgePublicUserData(admin, userId);
    if (purge.error) {
      console.error("delete-account purge failed:", purge.error);
      return jsonResponse(
        { error: `Could not remove all data: ${purge.error}` },
        corsHeaders,
        500,
      );
    }

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("delete-account auth.admin.deleteUser:", deleteAuthError.message);
      return jsonResponse(
        { error: deleteAuthError.message || "Could not delete auth user" },
        corsHeaders,
        500,
      );
    }

    return jsonResponse({ success: true }, corsHeaders);
  } catch (err: unknown) {
    console.error("delete-account error:", err);
    return jsonResponse({ error: "Unexpected server error" }, corsHeaders, 500);
  }
});
