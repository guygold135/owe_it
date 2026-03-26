import Stripe from "npm:stripe@16.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const defaultCountry = (Deno.env.get("STRIPE_CONNECT_DEFAULT_COUNTRY") ?? "US").toUpperCase();

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
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.id) return null;
  return user.id;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    if (!stripeSecret) {
      return jsonResponse({ error: "Stripe secret key not configured" }, 500);
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase not configured" }, 500);
    }

    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const returnUrl =
      typeof (body as { returnUrl?: string }).returnUrl === "string"
        ? (body as { returnUrl: string }).returnUrl
        : "";
    const refreshUrl =
      typeof (body as { refreshUrl?: string }).refreshUrl === "string"
        ? (body as { refreshUrl: string }).refreshUrl
        : returnUrl;

    if (!returnUrl || !returnUrl.startsWith("http")) {
      return jsonResponse({ error: "Missing or invalid returnUrl" }, 400);
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, display_name")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: "Profile not found" }, 404);
    }

    let accountId = profile.stripe_connect_account_id as string | null;

    let email = "";
    try {
      const { data: adminUser, error: adminErr } = await supabase.auth.admin.getUserById(userId);
      if (!adminErr && adminUser?.user?.email) {
        email = adminUser.user.email;
      }
    } catch {
      // ignore
    }

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: defaultCountry,
        email: email || undefined,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          app_user_id: userId,
        },
      });
      accountId = account.id;
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", userId);
      if (updateErr) {
        console.error("Could not save stripe_connect_account_id:", updateErr.message);
        return jsonResponse({ error: "Could not save Connect account" }, 500);
      }
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl || returnUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return jsonResponse({ url: link.url, accountId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("stripe-connect-onboarding:", message);
    return jsonResponse({ error: message }, 500);
  }
});
