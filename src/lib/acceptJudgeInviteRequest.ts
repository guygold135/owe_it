import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { notifyRequesterJudgeAccepted } from '@/lib/notifyJudgeAcceptedEmail';
import {
  captureJudgeInviteFromUrl,
  consumePendingJudgeAccept,
  clearJudgeInviteRequestFromUrl,
  peekPendingJudgeAccept,
} from '@/lib/judgeRequestEmailAccept';

const acceptInflight = new Map<string, Promise<boolean>>();

export function resolveJudgeInviteRequestId(pathname: string): string | null {
  const pathMatch = pathname.match(/\/judge-invite\/([^/]+)/i);
  if (pathMatch?.[1]) return pathMatch[1];
  return peekPendingJudgeAccept();
}

/** Idempotent accept — safe if the hook and JudgeInviteAccept both run. */
export async function ensureJudgeInviteAccepted(requestId: string): Promise<boolean> {
  const id = requestId.trim();
  if (!id) return false;

  const inflight = acceptInflight.get(id);
  if (inflight) return inflight;

  const promise = supabase.rpc('accept_judge_request', { p_request_id: id }).then(({ error }) => {
    acceptInflight.delete(id);

    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('not pending') || msg.includes('not found')) {
        consumePendingJudgeAccept();
        clearJudgeInviteRequestFromUrl();
        return true;
      }
      toast.error(error.message ?? 'Could not accept this judge request.');
      return false;
    }

    consumePendingJudgeAccept();
    clearJudgeInviteRequestFromUrl();
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
