import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getResendFromAddress } from "../_shared/resendFrom.ts";
import { buildJudgeAcceptedEmailHtml } from "../_shared/judgeAcceptedEmail.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function resolveAppUrl(): string {
  const configured = Deno.env.get("APP_URL")?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "https://oweit.site";
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !supabaseUrl || !supabaseAnonKey) return null;
  const token = authHeader.slice(7);
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.id) return null;
  return user.id;
}

async function resolveContinueUrl(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  pageUrl: string,
): Promise<string> {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: pageUrl },
  });

  if (!linkError && linkData?.properties?.action_link) {
    return linkData.properties.action_link;
  }

  if (linkError) {
    console.warn("notify-judge-accepted generateLink fallback:", linkError.message);
  }

  return pageUrl;
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
    return jsonResponse({ error: "Method not allowed" }, corsHeaders, 405);
  }

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Server configuration missing" }, corsHeaders, 500);
    }

    const body = await req.json().catch(() => ({}));
    const judgeRequestId = typeof body?.judgeRequestId === "string" ? body.judgeRequestId.trim() : "";
    if (!judgeRequestId) {
      return jsonResponse({ error: "judgeRequestId is required" }, corsHeaders, 400);
    }

    const authUserId = await getAuthenticatedUserId(req);
    if (!authUserId) {
      return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: judgeRequest, error: fetchError } = await supabaseAdmin
      .from("judge_requests")
      .select("id, requester_user_id, judge_user_id, status, requester_departed_at, goal_payload")
      .eq("id", judgeRequestId)
      .maybeSingle();

    if (fetchError) {
      console.error("notify-judge-accepted fetch error:", fetchError.message);
      return jsonResponse({ error: "Could not load judge request" }, corsHeaders, 500);
    }
    if (!judgeRequest) {
      return jsonResponse({ error: "Judge request not found" }, corsHeaders, 404);
    }
    if (judgeRequest.status !== "accepted") {
      return jsonResponse({ emailed: false, reason: "not_accepted" }, corsHeaders, 200);
    }
    if (judgeRequest.judge_user_id !== authUserId && judgeRequest.requester_user_id !== authUserId) {
      return jsonResponse({ error: "Forbidden" }, corsHeaders, 403);
    }
    if (!judgeRequest.requester_departed_at) {
      return jsonResponse({ emailed: false, reason: "requester_still_in_flow" }, corsHeaders, 200);
    }

    const { data: requesterAuth, error: requesterAuthError } = await supabaseAdmin.auth.admin.getUserById(
      judgeRequest.requester_user_id,
    );
    if (requesterAuthError) {
      console.error("notify-judge-accepted requester auth error:", requesterAuthError.message);
      return jsonResponse({ error: "Could not load requester account" }, corsHeaders, 500);
    }

    const requesterEmail = requesterAuth?.user?.email?.trim();
    if (!requesterEmail) {
      return jsonResponse({ emailed: false, reason: "requester_has_no_email" }, corsHeaders, 200);
    }

    const { data: judgeProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", judgeRequest.judge_user_id)
      .maybeSingle();

    const judgeNameRaw =
      String((judgeProfile as { display_name?: string | null } | null)?.display_name ?? "Your judge").trim() ||
      "Your judge";

    const payload = (judgeRequest.goal_payload ?? null) as Record<string, unknown> | null;
    const goalTitle = String(payload?.title ?? "your goal").trim() || "your goal";

    if (!resendApiKey) {
      return jsonResponse({ emailed: false, reason: "email_not_configured" }, corsHeaders, 200);
    }

    const continuePageUrl = `${resolveAppUrl()}/?resumeGoalRequest=${judgeRequestId}`;
    const continueUrl = await resolveContinueUrl(supabaseAdmin, requesterEmail, continuePageUrl);
    const html = buildJudgeAcceptedEmailHtml({
      judgeName: judgeNameRaw,
      goalTitle,
      continueUrl,
    });

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getResendFromAddress(),
        to: [requesterEmail],
        subject: `${judgeNameRaw} accepted judging "${goalTitle}"`,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("notify-judge-accepted Resend error:", errorText);
      return jsonResponse({ emailed: false, reason: "email_send_failed" }, corsHeaders, 200);
    }

    return jsonResponse({ success: true, emailed: true }, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("notify-judge-accepted error:", message);
    return jsonResponse({ error: "Unexpected server error" }, corsHeaders, 500);
  }
});
