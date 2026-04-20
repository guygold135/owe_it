import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("AUTO_EXPIRE_CRON_SECRET");
const maxStaleRaw = Deno.env.get("SETTLEMENT_HEALTH_MAX_STALE_MINUTES");
const maxStaleMinutes = Number(maxStaleRaw && maxStaleRaw.length > 0 ? maxStaleRaw : "90");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return json({ error: "Server configuration missing" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: row, error } = await supabase
    .from("goal_settlement_runs")
    .select("started_at, status, error_count")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json({ ok: false, error: error.message }, 500);

  if (!row?.started_at) {
    return json({ ok: false, reason: "no_runs" }, 503);
  }

  const started = new Date(row.started_at as string).getTime();
  const ageMs = Date.now() - started;
  const maxMs = (Number.isFinite(maxStaleMinutes) ? maxStaleMinutes : 90) * 60 * 1000;

  if (ageMs > maxMs) {
    return json(
      {
        ok: false,
        reason: "stale",
        lastStartedAt: row.started_at,
        ageMinutes: Math.round(ageMs / 60_000),
        maxStaleMinutes: Number.isFinite(maxStaleMinutes) ? maxStaleMinutes : 90,
      },
      503,
    );
  }

  return json({
    ok: true,
    lastStartedAt: row.started_at,
    status: row.status,
    error_count: row.error_count,
    ageMinutes: Math.round(ageMs / 60_000),
  });
});
