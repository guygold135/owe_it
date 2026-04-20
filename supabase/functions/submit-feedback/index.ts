import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const feedbackToEmail = Deno.env.get("FEEDBACK_TO_EMAIL");
const feedbackFromEmail = Deno.env.get("FEEDBACK_FROM_EMAIL") ?? "feedback@oweit.app";

const allowedCategories = new Set([
  "Improvement idea",
  "Technical problem",
  "Payment problem",
  "Account issue",
  "Bug report",
  "Feature request",
  "Other",
]);

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function getAuthenticatedUser(req: Request): Promise<{ id: string; email: string | null } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !supabaseUrl || !supabaseAnonKey) return null;
  const token = authHeader.slice(7);
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.id) return null;
  return { id: user.id, email: user.email ?? null };
}

async function sendFeedbackEmail(params: {
  category: string;
  message: string;
  userId: string;
  userEmail: string | null;
}) {
  if (!resendApiKey || !feedbackToEmail) {
    return { emailed: false, reason: "email_not_configured" as const };
  }

  const html = `
    <h2>New website feedback</h2>
    <p><strong>Category:</strong> ${params.category}</p>
    <p><strong>User ID:</strong> ${params.userId}</p>
    <p><strong>User email:</strong> ${params.userEmail ?? "Unknown"}</p>
    <hr />
    <p style="white-space: pre-wrap;">${params.message}</p>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: feedbackFromEmail,
      to: [feedbackToEmail],
      subject: `[Feedback] ${params.category}`,
      html,
      reply_to: params.userEmail ?? undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Resend email send failed:", errorText);
    return { emailed: false, reason: "email_send_failed" as const };
  }

  return { emailed: true };
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
        500
      );
    }

    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return jsonResponse({ error: "Unauthorized" }, corsHeaders, 401);
    }

    const { category, message } = await req.json();
    const safeCategory = typeof category === "string" ? category.trim() : "";
    const safeMessage = typeof message === "string" ? message.trim() : "";

    if (!allowedCategories.has(safeCategory)) {
      return jsonResponse({ error: "Invalid feedback category" }, corsHeaders, 400);
    }
    if (!safeMessage) {
      return jsonResponse({ error: "Feedback message is required" }, corsHeaders, 400);
    }
    if (safeMessage.length > 5000) {
      return jsonResponse({ error: "Feedback message is too long" }, corsHeaders, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error: insertError } = await supabase
      .from("feedback_submissions")
      .insert({
        user_id: authUser.id,
        user_email: authUser.email,
        category: safeCategory,
        message: safeMessage,
      });

    if (insertError) {
      console.error("Feedback insert failed:", insertError.message);
      return jsonResponse({ error: "Could not save feedback" }, corsHeaders, 500);
    }

    const emailResult = await sendFeedbackEmail({
      category: safeCategory,
      message: safeMessage,
      userId: authUser.id,
      userEmail: authUser.email,
    });

    return jsonResponse({
      success: true,
      emailed: emailResult.emailed,
    }, corsHeaders);
  } catch (err: any) {
    console.error("submit-feedback error:", err?.message ?? err);
    return jsonResponse({ error: "Unexpected server error" }, corsHeaders, 500);
  }
});
