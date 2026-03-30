import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
        500,
      );
    }

    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const purge = await purgePublicUserData(admin, userId);
    if (purge.error) {
      console.error("delete-account purge failed:", purge.error);
      return jsonResponse(
        { error: `Could not remove all data: ${purge.error}` },
        500,
      );
    }

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("delete-account auth.admin.deleteUser:", deleteAuthError.message);
      return jsonResponse(
        { error: deleteAuthError.message || "Could not delete auth user" },
        500,
      );
    }

    return jsonResponse({ success: true });
  } catch (err: unknown) {
    console.error("delete-account error:", err);
    return jsonResponse({ error: "Unexpected server error" }, 500);
  }
});
