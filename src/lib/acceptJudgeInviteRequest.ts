import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { notifyRequesterJudgeAccepted } from '@/lib/notifyJudgeAcceptedEmail';
import {
  captureJudgeInviteFromUrl,
  consumePendingJudgeAccept,
  clearJudgeInviteRequestFromUrl,
  consumeJudgeEmailFlow,
  consumeMagicLinkAuthPending,
  peekJudgeEmailFlow,
  peekMagicLinkAuthPending,
  peekPendingJudgeAccept,
} from '@/lib/judgeRequestEmailAccept';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METADATA_INVITE_KEY = 'pending_judge_invite_accept';
const METADATA_INVITE_AT_KEY = 'pending_judge_invite_at';
const METADATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const acceptInflight = new Map<string, Promise<boolean>>();

export function resolveJudgeInviteRequestId(pathname: string): string | null {
  const pathMatch = pathname.match(/\/judge-invite\/([^/]+)/i);
  if (pathMatch?.[1] && UUID_RE.test(pathMatch[1])) return pathMatch[1];
  if (peekJudgeEmailFlow() || pathname.includes('/judge-invite/')) {
    return peekPendingJudgeAccept();
  }
  return null;
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

function clearEmailFlowFlags(): void {
  consumePendingJudgeAccept();
  consumeJudgeEmailFlow();
  consumeMagicLinkAuthPending();
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
        clearJudgeInviteRequestFromUrl();
        clearEmailFlowFlags();
        await clearJudgeInviteMetadata();
        return true;
      }
      console.warn('accept_judge_request failed', error.message);
      toast.error(error.message ?? 'Could not accept this judge request.');
      return false;
    }

    clearJudgeInviteRequestFromUrl();
    clearEmailFlowFlags();
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

function resolveEmailLinkRequestId(
  pathname: string,
  userMetadata: Record<string, unknown> | null | undefined,
  allowMagicLinkMetadata: boolean,
): string | null {
  const fromPathOrStored = resolveJudgeInviteRequestId(pathname);
  if (fromPathOrStored) return fromPathOrStored;

  if (peekJudgeEmailFlow()) {
    return peekPendingJudgeAccept() ?? resolveJudgeInviteFromMetadata(userMetadata);
  }

  if (allowMagicLinkMetadata && peekMagicLinkAuthPending()) {
    return resolveJudgeInviteFromMetadata(userMetadata);
  }

  return null;
}

/**
 * Auto-accept only after the judge email link flow — not on normal sign-in.
 */
export async function runJudgeInviteAutoAccept(options: {
  pathname: string;
  userMetadata?: Record<string, unknown> | null;
  /** True only for fresh SIGNED_IN from a magic link (stripped redirect + metadata). */
  allowMagicLinkMetadata?: boolean;
}): Promise<boolean> {
  primeJudgeInviteFromUrl();

  const requestId = resolveEmailLinkRequestId(
    options.pathname,
    options.userMetadata,
    options.allowMagicLinkMetadata ?? false,
  );

  if (!requestId) return false;
  return ensureJudgeInviteAccepted(requestId);
}
