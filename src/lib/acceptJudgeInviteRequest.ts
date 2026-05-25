import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { notifyRequesterJudgeAccepted } from '@/lib/notifyJudgeAcceptedEmail';
import {
  captureJudgeInviteFromUrl,
  consumePendingJudgeAccept,
  clearJudgeInviteRequestFromUrl,
  consumeMagicLinkArrival,
  peekPendingJudgeAccept,
  peekMagicLinkArrival,
} from '@/lib/judgeRequestEmailAccept';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METADATA_INVITE_KEY = 'pending_judge_invite_accept';
const METADATA_INVITE_AT_KEY = 'pending_judge_invite_at';
const METADATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const acceptInflight = new Map<string, Promise<boolean>>();

export function resolveJudgeInviteRequestId(pathname: string): string | null {
  const pathMatch = pathname.match(/\/judge-invite\/([^/]+)/i);
  if (pathMatch?.[1] && UUID_RE.test(pathMatch[1])) return pathMatch[1];
  return peekPendingJudgeAccept();
}

function resolveJudgeInviteFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const raw = metadata?.[METADATA_INVITE_KEY];
  if (typeof raw !== 'string' || !UUID_RE.test(raw.trim())) return null;

  const atRaw = metadata?.[METADATA_INVITE_AT_KEY];
  if (typeof atRaw === 'string') {
    const atMs = Date.parse(atRaw);
    if (!Number.isNaN(atMs) && Date.now() - atMs > METADATA_MAX_AGE_MS) return null;
  }

  return raw.trim();
}

async function clearJudgeInviteMetadata(): Promise<void> {
  await supabase.auth.updateUser({
    data: {
      [METADATA_INVITE_KEY]: null,
      [METADATA_INVITE_AT_KEY]: null,
    },
  });
}

async function rpcAcceptJudgeRequest(requestId: string) {
  const first = await supabase.rpc('accept_judge_request', { p_request_id: requestId });
  if (!first.error) return first;

  const msg = (first.error.message ?? '').toLowerCase();
  if (msg.includes('not authenticated')) {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    return supabase.rpc('accept_judge_request', { p_request_id: requestId });
  }

  return first;
}

/** Idempotent accept — safe if the hook and JudgeInviteAccept both run. */
export async function ensureJudgeInviteAccepted(requestId: string): Promise<boolean> {
  const id = requestId.trim();
  if (!id) return false;

  const inflight = acceptInflight.get(id);
  if (inflight) return inflight;

  const promise = rpcAcceptJudgeRequest(id).then(async ({ error }) => {
    acceptInflight.delete(id);

    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('not pending') || msg.includes('not found')) {
        consumePendingJudgeAccept();
        clearJudgeInviteRequestFromUrl();
        consumeMagicLinkArrival();
        await clearJudgeInviteMetadata();
        return true;
      }
      console.warn('accept_judge_request failed', error.message);
      toast.error(error.message ?? 'Could not accept this judge request.');
      return false;
    }

    consumePendingJudgeAccept();
    clearJudgeInviteRequestFromUrl();
    consumeMagicLinkArrival();
    await clearJudgeInviteMetadata();
    toast.success('You accepted the judge request.');
    void notifyRequesterJudgeAccepted(id);
    return true;
  });

  acceptInflight.set(id, promise);
  return promise;
}

export function primeJudgeInviteFromUrl(): void {
  captureJudgeInviteFromUrl();
}

async function resolveLatestPendingJudgeRequest(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('judge_requests')
    .select('id')
    .eq('judge_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id;
}

/**
 * Auto-accept after email link sign-in.
 * URL/sessionStorage first; user metadata fallback on fresh SIGNED_IN (survives Supabase redirect stripping the path).
 */
export async function runJudgeInviteAutoAccept(options: {
  pathname: string;
  userId?: string;
  userMetadata?: Record<string, unknown> | null;
  allowMetadataFallback?: boolean;
}): Promise<boolean> {
  primeJudgeInviteFromUrl();

  let requestId = resolveJudgeInviteRequestId(options.pathname);
  const mayUseMetadata =
    options.allowMetadataFallback ||
    peekMagicLinkArrival() ||
    Boolean(peekPendingJudgeAccept()) ||
    options.pathname.includes('/judge-invite/');

  if (!requestId && mayUseMetadata) {
    requestId = resolveJudgeInviteFromMetadata(options.userMetadata);
  }

  if (!requestId && mayUseMetadata && options.userId) {
    requestId = await resolveLatestPendingJudgeRequest(options.userId);
  }

  if (!requestId) return false;
  return ensureJudgeInviteAccepted(requestId);
}
