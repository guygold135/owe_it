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

async function getAuthenticatedUser(
  req: Request,
): Promise<{ id: string; email: string | null } | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  return { id: data.user.id, email: data.user.email ?? null };
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

    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);

    // Configure exactly ONE admin account using either of these env vars:
    // - ADMIN_USER_ID (recommended)
    // - ADMIN_EMAIL
    const adminUserId = Deno.env.get("ADMIN_USER_ID") ?? "";
    const adminEmail = Deno.env.get("ADMIN_EMAIL") ?? "";

    const isAdmin =
      (adminUserId && authUser.id === adminUserId) ||
      (adminEmail && authUser.email?.toLowerCase() === adminEmail.toLowerCase());

    if (!isAdmin) {
      return jsonResponse({ error: "Forbidden" }, corsHeaders, 403);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await admin
      .from("feedback_submissions")
      .select("id,user_id,user_email,category,message,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin-feedback query error:", error);
      return jsonResponse({ error: "Could not load feedback" }, corsHeaders, 500);
    }

    return jsonResponse({ success: true, feedback: data }, corsHeaders);
  } catch (err: unknown) {
    console.error("admin-feedback error:", err);
    return jsonResponse({ error: "Unexpected server error" }, corsHeaders, 500);
  }
});

