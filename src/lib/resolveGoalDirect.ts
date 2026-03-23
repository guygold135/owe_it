import { supabase } from '@/integrations/supabase/client';

export type ResolveGoalOutcome = 'completed' | 'failed';

export type ResolveGoalDirectResult =
  | { success: true }
  | { success: false; error: string; httpStatus?: number };

/**
 * Calls the resolve-goal-direct Edge Function with the current session JWT.
 * Used by judge actions and by auto-expire when a deadline has passed.
 */
export async function resolveGoalDirect(params: {
  goalId: string;
  outcome: ResolveGoalOutcome;
}): Promise<ResolveGoalDirectResult> {
  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    return { success: false, error: userError.message ?? 'Not authenticated.' };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  let accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { success: false, error: 'Not authenticated (missing access token).' };
  }
  accessToken = String(accessToken).trim().replace(/^Bearer\s+/i, '');
  if (!accessToken.includes('.')) {
    return { success: false, error: 'Auth token does not look like a JWT.' };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) {
    return { success: false, error: 'Missing VITE_SUPABASE_URL.' };
  }

  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!apikey) {
    return { success: false, error: 'Missing VITE_SUPABASE_PUBLISHABLE_KEY (apikey).' };
  }

  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/resolve-goal-direct`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ goalId: params.goalId, outcome: params.outcome }),
  });

  const raw = await res.text();
  let parsed: { success?: boolean; error?: string } | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    return {
      success: false,
      error: parsed?.error ?? raw?.slice(0, 500) ?? `Resolve failed with status ${res.status}.`,
      httpStatus: res.status,
    };
  }

  if (!parsed?.success) {
    return { success: false, error: parsed?.error ?? 'Could not resolve goal.' };
  }

  return { success: true };
}
