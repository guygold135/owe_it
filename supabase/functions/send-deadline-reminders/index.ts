import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getResendFromAddress } from "../_shared/resendFrom.ts";
import {
  buildDeadlineReminderEmailHtml,
  deadlineReminderBodyText,
  deadlineReminderSubject,
  escapeHtml,
  type DeadlineReminderThreshold,
} from "../_shared/deadlineReminderEmail.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const cronSecret = Deno.env.get("AUTO_EXPIRE_CRON_SECRET");

const MS_24H = 24 * 60 * 60 * 1000;
const MS_6H = 6 * 60 * 60 * 1000;

type GoalRow = {
  id: string;
  user_id: string;
  judge_user_id: string | null;
  title: string;
  deadline: string;
  stake: number | null;
  stake_currency: string | null;
};

type SentRow = {
  goal_id: string;
  threshold: DeadlineReminderThreshold;
  email_sent_at: string | null;
};

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

function inAppTitle(threshold: DeadlineReminderThreshold, role: "owner" | "judge"): string {
  if (threshold === "6h") {
    return role === "judge" ? "Urgent — judging soon" : "Urgent — under 6 hours";
  }
  return role === "judge" ? "Goal due in under 24 hours" : "Deadline in under 24 hours";
}

function inAppKind(threshold: DeadlineReminderThreshold): string {
  return threshold === "6h" ? "deadline_6h" : "deadline_24h";
}

function formatStakeLine(stake: number | null): string {
  const amount = Number(stake ?? 0);
  return amount > 0 ? `$${amount}` : "Free";
}

async function resolveOpenUrl(
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
    console.warn("send-deadline-reminders generateLink fallback:", linkError.message);
  }

  return pageUrl;
}

async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!resendApiKey) {
    return { ok: false, error: "email_not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getResendFromAddress(),
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("send-deadline-reminders Resend error:", errorText);
    let message = "Email provider rejected the send.";
    try {
      const parsed = JSON.parse(errorText) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      if (errorText.trim()) message = errorText.trim().slice(0, 300);
    }
    return { ok: false, error: message };
  }

  return { ok: true };
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(
    req,
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  );
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
    if (!cronSecret) {
      return jsonResponse({ error: "AUTO_EXPIRE_CRON_SECRET is not configured" }, corsHeaders, 500);
    }

    const provided = req.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const appUrl = resolveAppUrl();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const deadlineCutoffIso = new Date(now + MS_24H).toISOString();

    const { data: goals, error: goalsError } = await supabase
      .from("goals")
      .select("id,user_id,judge_user_id,title,deadline,stake,stake_currency")
      .eq("status", "active")
      .gt("deadline", nowIso)
      .lte("deadline", deadlineCutoffIso);

    if (goalsError) {
      console.error("send-deadline-reminders goals query:", goalsError.message);
      return jsonResponse({ error: "Could not load goals" }, corsHeaders, 500);
    }

    const goalList = (goals ?? []) as GoalRow[];
    if (goalList.length === 0) {
      return jsonResponse({ success: true, processed: 0, emailsSent: 0, inAppCreated: 0 }, corsHeaders);
    }

    const goalIds = goalList.map((g) => g.id);
    const { data: sentRows, error: sentError } = await supabase
      .from("goal_deadline_reminder_sent")
      .select("goal_id,threshold,email_sent_at")
      .in("goal_id", goalIds);

    if (sentError) {
      console.error("send-deadline-reminders sent query:", sentError.message);
      return jsonResponse({ error: "Could not load reminder state" }, corsHeaders, 500);
    }

    const sentByKey = new Map<string, SentRow>();
    for (const row of (sentRows ?? []) as SentRow[]) {
      sentByKey.set(`${row.goal_id}:${row.threshold}`, row);
    }

    const emailCache = new Map<string, string | null>();
    const getEmail = async (userId: string): Promise<string | null> => {
      if (emailCache.has(userId)) return emailCache.get(userId) ?? null;
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error) {
        console.warn(`send-deadline-reminders getUserById ${userId}:`, error.message);
        emailCache.set(userId, null);
        return null;
      }
      const email = data?.user?.email?.trim() ?? null;
      emailCache.set(userId, email);
      return email;
    };

    let inAppCreated = 0;
    let emailsSent = 0;
    let emailErrors = 0;
    let processed = 0;

    for (const goal of goalList) {
      const msLeft = new Date(goal.deadline).getTime() - now;
      if (msLeft <= 0) continue;

      const selfJudged = !goal.judge_user_id || goal.judge_user_id === goal.user_id;
      const deadlineLine = escapeHtml(new Date(goal.deadline).toLocaleString());
      const stakeLine = escapeHtml(formatStakeLine(goal.stake));
      const goalTitle = String(goal.title ?? "Goal").trim() || "Goal";

      const thresholds: { threshold: DeadlineReminderThreshold; maxMs: number }[] = [
        { threshold: "24h", maxMs: MS_24H },
        { threshold: "6h", maxMs: MS_6H },
      ];

      for (const { threshold, maxMs } of thresholds) {
        if (msLeft > maxMs) continue;

        processed += 1;
        const key = `${goal.id}:${threshold}`;
        const existing = sentByKey.get(key);
        const kind = inAppKind(threshold);

        if (!existing) {
          const ownerBody = deadlineReminderBodyText(threshold, goalTitle, "owner", selfJudged);
          const notifications: {
            user_id: string;
            kind: string;
            title: string;
            body: string;
            goal_id: string;
          }[] = [
            {
              user_id: goal.user_id,
              kind,
              title: inAppTitle(threshold, "owner"),
              body: ownerBody,
              goal_id: goal.id,
            },
          ];

          if (goal.judge_user_id && goal.judge_user_id !== goal.user_id) {
            notifications.push({
              user_id: goal.judge_user_id,
              kind,
              title: threshold === "6h" ? "Urgent — judging soon" : "Goal due in under 24 hours",
              body: deadlineReminderBodyText(threshold, goalTitle, "judge", false),
              goal_id: goal.id,
            });
          }

          const { error: insertSentError } = await supabase
            .from("goal_deadline_reminder_sent")
            .insert({ goal_id: goal.id, threshold });

          if (insertSentError) {
            console.error("send-deadline-reminders insert sent:", insertSentError.message);
            continue;
          }

          const { error: notifyError } = await supabase.from("in_app_notifications").insert(notifications);
          if (notifyError) {
            console.error("send-deadline-reminders in_app insert:", notifyError.message);
          } else {
            inAppCreated += notifications.length;
          }

          sentByKey.set(key, { goal_id: goal.id, threshold, email_sent_at: null });
        }

        const sentState = sentByKey.get(key);
        if (!sentState || sentState.email_sent_at) continue;

        const recipients: { userId: string; role: "owner" | "judge"; pagePath: string }[] = [
          { userId: goal.user_id, role: "owner", pagePath: "/" },
        ];
        if (goal.judge_user_id && goal.judge_user_id !== goal.user_id) {
          recipients.push({ userId: goal.judge_user_id, role: "judge", pagePath: "/my-judges" });
        }

        let emailsAttempted = 0;
        let emailsFailed = 0;

        for (const recipient of recipients) {
          const email = await getEmail(recipient.userId);
          if (!email) continue;

          emailsAttempted += 1;
          const pageUrl = `${appUrl}${recipient.pagePath}`;
          const openUrl = await resolveOpenUrl(supabase, email, pageUrl);
          const bodyText = deadlineReminderBodyText(threshold, goalTitle, recipient.role, selfJudged);
          const headline = inAppTitle(threshold, recipient.role);
          const html = buildDeadlineReminderEmailHtml({
            headline,
            bodyText,
            goalTitle,
            deadlineLine,
            stakeLine,
            openUrl,
          });

          const sendResult = await sendResendEmail({
            to: email,
            subject: deadlineReminderSubject(threshold, goalTitle, recipient.role),
            html,
          });

          if (!sendResult.ok) {
            emailsFailed += 1;
            emailErrors += 1;
            console.warn(
              `send-deadline-reminders email failed goal=${goal.id} threshold=${threshold} user=${recipient.userId}:`,
              sendResult.error,
            );
          } else {
            emailsSent += 1;
          }
        }

        const shouldMarkEmailSent = emailsAttempted === 0 || emailsFailed === 0;
        if (shouldMarkEmailSent) {
          const { error: markError } = await supabase
            .from("goal_deadline_reminder_sent")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("goal_id", goal.id)
            .eq("threshold", threshold);

          if (markError) {
            console.error("send-deadline-reminders mark email_sent:", markError.message);
          } else {
            sentByKey.set(key, {
              goal_id: goal.id,
              threshold,
              email_sent_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    return jsonResponse(
      {
        success: true,
        goalsChecked: goalList.length,
        processed,
        inAppCreated,
        emailsSent,
        emailErrors,
        emailConfigured: Boolean(resendApiKey),
      },
      corsHeaders,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-deadline-reminders error:", message);
    return jsonResponse({ error: "Unexpected server error" }, corsHeaders, 500);
  }
});
