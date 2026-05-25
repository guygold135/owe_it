import { supabase } from '@/integrations/supabase/client';

export async function notifyRequesterJudgeAccepted(judgeRequestId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('notify-judge-accepted', {
    body: { judgeRequestId },
  });
  if (error) {
    console.warn('notify-judge-accepted', error);
    return;
  }
  const result = (data ?? {}) as { emailed?: boolean; reason?: string };
  if (result.emailed === false && result.reason && result.reason !== 'requester_still_in_flow') {
    console.warn('notify-judge-accepted skipped:', result.reason);
  }
}

/** Requester-side fallback if the judge client did not trigger email. */
export async function notifyRequesterJudgeAcceptedAsRequester(judgeRequestId: string): Promise<void> {
  await notifyRequesterJudgeAccepted(judgeRequestId);
}
