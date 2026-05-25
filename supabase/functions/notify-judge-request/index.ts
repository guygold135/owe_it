import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getFromEmailDomain, getResendFromAddress } from "../_shared/resendFrom.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");

function resolveAppUrl(req: Request): string {
  const configured = Deno.env.get("APP_URL")?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const origin = req.headers.get("origin")?.trim();
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, "");
  return "https://oweit.site";
}

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function goalPayloadSummary(payload: Record<string, unknown> | null): {
  title: string;
  deadlineLine: string;
  stakeLine: string;
} {
  const title = escapeHtml(String(payload?.title ?? "a goal").trim() || "a goal");
  const deadlineRaw = payload?.deadline;
  const deadlineLine =
    deadlineRaw != null
      ? escapeHtml(new Date(String(deadlineRaw)).toLocaleString())
      : "Not set";
  const stake = Number(payload?.stake ?? 0);
  const stakeLine = stake > 0 ? `$${stake}` : "Free";
  return { title, deadlineLine, stakeLine };
}

function buildJudgeInviteEmailHtml(params: {
  requesterName: string;
  title: string;
  deadlineLine: string;
  stakeLine: string;
  acceptUrl: string;
  usesMagicLink: boolean;
}): string {
  const { requesterName, title, deadlineLine, stakeLine, acceptUrl, usesMagicLink } = params;
  const cta = usesMagicLink ? "Sign in &amp; accept" : "Open invite &amp; accept";
  return [
    '<div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #111;">',
    `<h2 style="margin: 0 0 12px;">${requesterName} wants you to judge their goal</h2>`,
    `<p style="margin: 0 0 16px;">${requesterName} picked you as the judge for their goal on Owe It. Tap the button below to accept.</p>`,
    '<div style="background: #f4f4f5; border-radius: 12px; padding: 16px; margin: 0 0 20px;">',
    `<p style="margin: 0 0 8px;"><strong>Goal:</strong> ${title}</p>`,
    `<p style="margin: 0 0 8px;"><strong>Deadline:</strong> ${deadlineLine}</p>`,
    `<p style="margin: 0;"><strong>Stake:</strong> ${stakeLine}</p>`,
    "</div>",
    `<p style="margin: 0 0 20px;"><a href="${acceptUrl}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; font-weight: 600; padding: 12px 20px; border-radius: 999px;">${cta}</a></p>`,
    `<p style="margin: 0; font-size: 13px; color: #666;">If the button does not work, copy and paste this link into your browser:<br /><a href="${acceptUrl}">${acceptUrl}</a></p>`,
    "</div>",
  ].join("");
}

function buildJudgeInvitePathUrl(appUrl: string, judgeRequestId: string): string {
  return `${appUrl.replace(/\/$/, "")}/judge-invite/${judgeRequestId}`;
}

async function resolveAcceptUrl(
  supabaseAdmin: ReturnType<typeof createClient>,
  judgeEmail: string,
  redirectCandidates: string[],
  directFallbackUrl: string,
): Promise<{ acceptUrl: string; usesMagicLink: boolean }> {
  for (const redirectTo of redirectCandidates) {
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: judgeEmail,
      options: { redirectTo },
    });

    if (!linkError && linkData?.properties?.action_link) {
      return { acceptUrl: linkData.properties.action_link, usesMagicLink: true };
    }

    if (linkError) {
      console.warn("notify-judge-request generateLink fallback:", linkError.message, redirectTo);
    }
  }

  return { acceptUrl: directFallbackUrl, usesMagicLink: false };
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
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(
        { error: "Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        corsHeaders,
        500,
      );
    }

    const authUserId = await getAuthenticatedUserId(req);
    if (!authUserId) {
      return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
    }

    const body = await req.json();
    const judgeRequestId = typeof body?.judgeRequestId === "string" ? body.judgeRequestId.trim() : "";
    if (!judgeRequestId) {
      return jsonResponse({ error: "judgeRequestId is required" }, corsHeaders, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: judgeRequest, error: fetchError } = await supabaseAdmin
      .from("judge_requests")
      .select("id, requester_user_id, judge_user_id, goal_payload, status")
      .eq("id", judgeRequestId)
      .maybeSingle();

    if (fetchError) {
      console.error("notify-judge-request fetch error:", fetchError.message);
      return jsonResponse({ error: "Could not load judge request" }, corsHeaders, 500);
    }
    if (!judgeRequest) {
      return jsonResponse({ error: "Judge request not found" }, corsHeaders, 404);
    }
    if (judgeRequest.requester_user_id !== authUserId) {
      return jsonResponse({ error: "Forbidden" }, corsHeaders, 403);
    }
    if (judgeRequest.status !== "pending") {
      return jsonResponse({ emailed: false, reason: "not_pending" }, corsHeaders, 200);
    }

    const { data: judgeAuth, error: judgeAuthError } = await supabaseAdmin.auth.admin.getUserById(
      judgeRequest.judge_user_id,
    );
    if (judgeAuthError) {
      console.error("notify-judge-request judge auth error:", judgeAuthError.message);
      return jsonResponse({ error: "Could not load judge account" }, corsHeaders, 500);
    }

    const judgeEmail = judgeAuth?.user?.email?.trim();
    if (!judgeEmail) {
      return jsonResponse({ emailed: false, reason: "judge_has_no_email" }, corsHeaders, 200);
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", judgeRequest.requester_user_id)
      .maybeSingle();

    const requesterNameRaw =
      String((requesterProfile as { display_name?: string | null } | null)?.display_name ?? "Someone").trim() ||
      "Someone";
    const requesterName = escapeHtml(requesterNameRaw);

    const payload = (judgeRequest.goal_payload ?? null) as Record<string, unknown> | null;
    const { title, deadlineLine, stakeLine } = goalPayloadSummary(payload);

    const appUrl = resolveAppUrl(req);
    const invitePageUrl = buildJudgeInvitePathUrl(appUrl, judgeRequestId);
    const { acceptUrl, usesMagicLink } = await resolveAcceptUrl(
      supabaseAdmin,
      judgeEmail,
      [invitePageUrl],
      invitePageUrl,
    );

    if (!resendApiKey) {
      return jsonResponse({ emailed: false, reason: "email_not_configured" }, corsHeaders, 200);
    }

    const html = buildJudgeInviteEmailHtml({
      requesterName,
      title,
      deadlineLine,
      stakeLine,
      acceptUrl,
      usesMagicLink,
    });

    const fromEmail = getResendFromAddress();

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [judgeEmail],
        subject: `${requesterNameRaw} asked you to judge their goal on Owe It`,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("notify-judge-request Resend error:", errorText);
      let resendError = "Email provider rejected the send.";
      try {
        const parsed = JSON.parse(errorText) as { message?: string };
        if (parsed.message) resendError = parsed.message;
      } catch {
        if (errorText.trim()) resendError = errorText.trim().slice(0, 300);
      }
      return jsonResponse(
        {
          emailed: false,
          reason: "email_send_failed",
          resendError,
          fromAddress: fromEmail,
          fromDomain: getFromEmailDomain(fromEmail),
        },
        corsHeaders,
        200,
      );
    }

    return jsonResponse(
      { success: true, emailed: true, usesMagicLink, fromAddress: fromEmail },
      corsHeaders,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("notify-judge-request error:", message);
    return jsonResponse({ error: "Unexpected server error" }, corsHeaders, 500);
  }
});
